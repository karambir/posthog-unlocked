import { PluginEvent } from '@posthog/plugin-scaffold'
import { HighLevelProducer as RdKafkaProducer, Message, NumberNullUndefined } from 'node-rdkafka'

import {
    KAFKA_CLICKHOUSE_SESSION_RECORDING_EVENTS,
    KAFKA_PERFORMANCE_EVENTS,
    KAFKA_SESSION_RECORDING_EVENTS,
    KAFKA_SESSION_RECORDING_EVENTS_DLQ,
} from '../../config/kafka-topics'
import { startBatchConsumer } from '../../kafka/batch-consumer'
import { createRdConnectionConfigFromEnvVars } from '../../kafka/config'
import { retryOnDependencyUnavailableError } from '../../kafka/error-handling'
import { createKafkaProducer, disconnectProducer, flushProducer, produce } from '../../kafka/producer'
import { PipelineEvent, RawEventMessage, Team } from '../../types'
import { KafkaConfig } from '../../utils/db/hub'
import { status } from '../../utils/status'
import { createPerformanceEvent, createSessionRecordingEvent } from '../../worker/ingestion/process-event'
import { TeamManager } from '../../worker/ingestion/team-manager'
import { parseEventTimestamp } from '../../worker/ingestion/timestamps'
import { eventDroppedCounter } from './metrics'

export const startSessionRecordingEventsConsumer = async ({
    teamManager,
    kafkaConfig,
    consumerMaxBytes,
    consumerMaxBytesPerPartition,
    consumerMaxWaitMs,
}: {
    teamManager: TeamManager
    kafkaConfig: KafkaConfig
    consumerMaxBytes: number
    consumerMaxBytesPerPartition: number
    consumerMaxWaitMs: number
}) => {
    /*
        For Session Recordings we need to prepare the data for ClickHouse.
        Additionally, we process `$performance_event` events which are closely
        tied to session recording events.

        We use the node-rdkafka library for handling consumption and production
        from Kafka. Note that this is different from the other consumers as this
        is a test bed for consumer improvements, which should be ported to the
        other consumers.

        We consume batches of messages, process these to completion, including
        getting acknowledgements that the messages have been pushed to Kafka,
        then commit the offsets of the messages we have processed. We do this
        instead of going completely stream happy just to keep the complexity
        low. We may well move this ingester to a different framework
        specifically for stream processing so no need to put too much work into
        this.
    */

    const groupId = 'session-recordings'
    const sessionTimeout = 30000
    const fetchBatchSize = 500

    status.info('🔁', 'Starting session recordings consumer')

    const connectionConfig = createRdConnectionConfigFromEnvVars(kafkaConfig)
    const producer = await createKafkaProducer(connectionConfig)
    const eachBatchWithContext = eachBatch({ teamManager, producer })

    // Create a node-rdkafka consumer that fetches batches of messages, runs
    // eachBatchWithContext, then commits offsets for the batch.
    const consumer = await startBatchConsumer({
        connectionConfig,
        groupId,
        topic: KAFKA_SESSION_RECORDING_EVENTS,
        sessionTimeout,
        consumerMaxBytesPerPartition,
        consumerMaxBytes,
        consumerMaxWaitMs,
        fetchBatchSize,
        eachBatch: eachBatchWithContext,
    })

    // Make sure to disconnect the producer after we've finished consuming.
    consumer.join().finally(async () => {
        await disconnectProducer(producer)
    })

    return consumer
}

export const eachBatch =
    ({ teamManager, producer }: { teamManager: TeamManager; producer: RdKafkaProducer }) =>
    async (messages: Message[]) => {
        // To start with, we simply process each message in turn,
        // without attempting to perform any concurrency. There is a lot
        // of caching e.g. for team lookups so not so much IO going on
        // anyway.
        //
        // Where we do allow some parallelism is in the producing to
        // Kafka. The eachMessage function will return a Promise for any
        // produce requests, rather than blocking on them. This way we
        // can handle errors for the main processing, and the production
        // errors separately.
        //
        // For the main processing errors we will check to see if they
        // are intermittent errors, and if so, we will retry the
        // processing of the message. If the error is not intermittent,
        // we will simply stop processing as we assume this is a code
        // issue that will need to be resolved. We use
        // DependencyUnavailableError error to distinguish between
        // intermittent and permanent errors.
        const pendingProduceRequests: Promise<NumberNullUndefined>[] = []
        const eachMessageWithContext = eachMessage({ teamManager, producer })

        for (const message of messages) {
            const results = await retryOnDependencyUnavailableError(() => eachMessageWithContext(message))
            if (results) {
                pendingProduceRequests.push(...results)
            }
        }

        // On each loop, we flush the producer to ensure that all messages
        // are sent to Kafka.
        try {
            await flushProducer(producer)
        } catch (error) {
            // Rather than handling errors from flush, we instead handle
            // errors per produce request, which gives us a little more
            // flexibility in terms of deciding if it is a terminal
            // error or not.
        }

        // We wait on all the produce requests to complete. After the
        // flush they should all have been resolved/rejected already. If
        // we get an intermittent error, such as a Kafka broker being
        // unavailable, we will throw. We are relying on the Producer
        // already having handled retries internally.
        for (const produceRequest of pendingProduceRequests) {
            try {
                await produceRequest
            } catch (error) {
                status.error('🔁', 'main_loop_error', { error })

                if (error?.isRetriable) {
                    // We assume the if the error is retriable, then we
                    // are probably in a state where e.g. Kafka is down
                    // temporarily and we would rather simply throw and
                    // have the process restarted.
                    throw error
                }
            }
        }
    }

const eachMessage =
    ({ teamManager, producer }: { teamManager: TeamManager; producer: RdKafkaProducer }) =>
    async (message: Message) => {
        // For each message, we:
        //
        //  1. Check that the message is valid. If not, send it to the DLQ.
        //  2. Parse the message and extract the event.
        //  3. Get the associated team for the event.
        //  4. Convert the event to something we can insert into ClickHouse.

        if (!message.value || !message.timestamp) {
            status.warn('⚠️', 'invalid_message', {
                reason: 'empty',
                offset: message.offset,
                partition: message.partition,
            })
            return [
                produce(
                    producer,
                    KAFKA_SESSION_RECORDING_EVENTS_DLQ,
                    message.value,
                    message.key ? Buffer.from(message.key) : null
                ),
            ]
        }

        let messagePayload: RawEventMessage
        let event: PipelineEvent

        try {
            // NOTE: we need to parse the JSON for these events because we
            // need to add in the team_id to events, as it is possible due
            // to a drive to remove postgres dependency on the the capture
            // endpoint we may only have `token`.
            messagePayload = JSON.parse(message.value.toString())
            event = JSON.parse(messagePayload.data)
        } catch (error) {
            status.warn('⚠️', 'invalid_message', {
                reason: 'invalid_json',
                error: error,
                offset: message.offset,
                partition: message.partition,
            })
            return [
                produce(
                    producer,
                    KAFKA_SESSION_RECORDING_EVENTS_DLQ,
                    message.value,
                    message.key ? Buffer.from(message.key) : null
                ),
            ]
        }

        status.debug('⬆️', 'processing_session_recording', { uuid: messagePayload.uuid })

        if (messagePayload.team_id == null && !messagePayload.token) {
            eventDroppedCounter
                .labels({
                    event_type: 'session_recordings',
                    drop_cause: 'no_token',
                })
                .inc()
            status.warn('⚠️', 'invalid_message', {
                reason: 'no_token',
                offset: message.offset,
                partition: message.partition,
            })
            return
        }

        let team: Team | null = null

        if (messagePayload.team_id != null) {
            team = await teamManager.fetchTeam(messagePayload.team_id)
        } else if (messagePayload.token) {
            team = await teamManager.getTeamByToken(messagePayload.token)
        }

        if (team == null) {
            eventDroppedCounter
                .labels({
                    event_type: 'session_recordings',
                    drop_cause: 'invalid_token',
                })
                .inc()
            status.warn('⚠️', 'invalid_message', {
                reason: 'team_not_found',
                offset: message.offset,
                partition: message.partition,
            })
            return
        }

        if (team.session_recording_opt_in) {
            try {
                if (event.event === '$snapshot') {
                    const clickHouseRecord = createSessionRecordingEvent(
                        messagePayload.uuid,
                        team.id,
                        messagePayload.distinct_id,
                        parseEventTimestamp(event as PluginEvent),
                        event.ip,
                        event.properties || {}
                    )

                    return [
                        produce(
                            producer,
                            KAFKA_CLICKHOUSE_SESSION_RECORDING_EVENTS,
                            Buffer.from(JSON.stringify(clickHouseRecord)),
                            message.key ? Buffer.from(message.key) : null
                        ),
                    ]
                } else if (event.event === '$performance_event') {
                    const clickHouseRecord = createPerformanceEvent(
                        messagePayload.uuid,
                        team.id,
                        messagePayload.distinct_id,
                        event.properties || {}
                    )

                    return [
                        produce(
                            producer,
                            KAFKA_PERFORMANCE_EVENTS,
                            Buffer.from(JSON.stringify(clickHouseRecord)),
                            message.key ? Buffer.from(message.key) : null
                        ),
                    ]
                } else {
                    status.warn('⚠️', 'invalid_message', {
                        reason: 'invalid_event_type',
                        type: event.event,
                        offset: message.offset,
                        partition: message.partition,
                    })
                    eventDroppedCounter
                        .labels({
                            event_type: 'session_recordings',
                            drop_cause: 'invalid_event_type',
                        })
                        .inc()
                }
            } catch (error) {
                status.error('⚠️', 'processing_error', {
                    eventId: event.uuid,
                    error: error,
                })
            }
        } else {
            eventDroppedCounter
                .labels({
                    event_type: 'session_recordings',
                    drop_cause: 'disabled',
                })
                .inc()
        }
    }
