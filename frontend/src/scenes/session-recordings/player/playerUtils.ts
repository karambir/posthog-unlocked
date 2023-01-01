import { MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from 'react'
import {
    PlayerPosition,
    RecordingSegment,
    RecordingStartAndEndTime,
    SessionRecordingPlaylistType,
    SessionRecordingType,
} from '~/types'
import { ExpandableConfig } from 'lib/components/LemonTable'
import api from 'lib/api'
import { lemonToast } from 'lib/components/lemonToast'
import { router } from 'kea-router'
import { urls } from 'scenes/urls'

export const THUMB_SIZE = 15
export const THUMB_OFFSET = THUMB_SIZE / 2

export type ReactInteractEvent = ReactMouseEvent<HTMLDivElement, MouseEvent> | ReactTouchEvent<HTMLDivElement>
export type InteractEvent = MouseEvent | TouchEvent

export function isTouchEvent(
    event: ReactInteractEvent | InteractEvent
): event is ReactTouchEvent<HTMLDivElement> | TouchEvent {
    return 'touches' in event
}

export function isMouseEvent(
    event: ReactInteractEvent | InteractEvent
): event is ReactMouseEvent<HTMLDivElement> | MouseEvent {
    return 'clientX' in event
}

export const getXPos = (event: ReactInteractEvent | InteractEvent): number => {
    if (isTouchEvent(event)) {
        return event?.touches?.[0]?.pageX ?? event?.changedTouches?.[0]?.pageX // x coordinates are in changedTouches on touchend
    }
    if (isMouseEvent(event)) {
        return event?.clientX
    }
    return 0
}

// Returns a positive number if a is greater than b, negative if b is greater than a, and 0 if they are equal
export function comparePlayerPositions(a: PlayerPosition, b: PlayerPosition, segments: RecordingSegment[]): number {
    if (a.windowId === b.windowId) {
        return a.time - b.time
    }
    for (const segment of segments) {
        if (
            a.windowId === segment.windowId &&
            a.time >= segment.startPlayerPosition.time &&
            a.time <= segment.endPlayerPosition.time
        ) {
            return -1
        } else if (
            b.windowId === segment.windowId &&
            b.time >= segment.startPlayerPosition.time &&
            b.time <= segment.endPlayerPosition.time
        ) {
            return 1
        }
    }
    throw `Could not find player positions in segments`
}

export function getSegmentFromPlayerPosition(
    playerPosition: PlayerPosition,
    segments: RecordingSegment[]
): RecordingSegment | null {
    for (const segment of segments) {
        if (
            playerPosition.windowId === segment.windowId &&
            playerPosition.time >= segment.startPlayerPosition.time &&
            playerPosition.time <= segment.endPlayerPosition.time
        ) {
            return segment
        }
    }
    return null
}

export function getPlayerTimeFromPlayerPosition(
    playerPosition: PlayerPosition,
    segments: RecordingSegment[]
): number | null {
    let time = 0
    for (const segment of segments) {
        if (
            playerPosition.windowId === segment.windowId &&
            playerPosition.time >= segment.startPlayerPosition.time &&
            playerPosition.time <= segment.endPlayerPosition.time
        ) {
            return time + playerPosition.time - segment.startPlayerPosition.time
        } else {
            time += segment.durationMs
        }
    }
    return null
}

export function getPlayerPositionFromPlayerTime(
    playerTime: number,
    segments: RecordingSegment[]
): PlayerPosition | null {
    let currentTime = 0
    for (const segment of segments) {
        if (currentTime + segment.durationMs > playerTime) {
            return {
                windowId: segment.windowId,
                time: playerTime - currentTime + segment.startPlayerPosition.time,
            }
        } else {
            currentTime += segment.durationMs
        }
    }
    // If we're at the end of the recording, return the final player position
    if (playerTime === currentTime && segments.length > 0) {
        return segments.slice(-1)[0].endPlayerPosition
    }
    return null
}

// Gets the player position from an epoch-time without a window-id
// Used to place backend events in a recording even though, they don't
// have a window id
export function guessPlayerPositionFromEpochTimeWithoutWindowId(
    epochTime: number,
    startAndEndTimesByWindowId: Record<string, RecordingStartAndEndTime>,
    segments: RecordingSegment[]
): PlayerPosition | null {
    for (const segment of segments) {
        if (epochTime >= segment.startTimeEpochMs && epochTime <= segment.endTimeEpochMs) {
            return getPlayerPositionFromEpochTime(epochTime, segment.windowId, startAndEndTimesByWindowId)
        }
    }
    return null
}

export function getPlayerPositionFromEpochTime(
    epochTime: number,
    windowId: string,
    startAndEndTimesByWindowId: Record<string, RecordingStartAndEndTime>
): PlayerPosition | null {
    if (startAndEndTimesByWindowId && windowId in startAndEndTimesByWindowId) {
        const windowStartTime = startAndEndTimesByWindowId[windowId].startTimeEpochMs
        const windowEndTime = startAndEndTimesByWindowId[windowId].endTimeEpochMs

        // We clamp the events to always be within the window range
        // This way events that are offset by a few seconds don't get lost
        if (windowStartTime > epochTime) {
            epochTime = windowStartTime
        }
        if (windowEndTime < epochTime) {
            epochTime = windowEndTime
        }

        return {
            windowId,
            time: epochTime - windowStartTime,
        }
    }
    return null
}

export function getEpochTimeFromPlayerPosition(
    playerPosition: PlayerPosition,
    startAndEndTimesByWindowId: Record<string, RecordingStartAndEndTime>
): number | null {
    if (playerPosition.windowId in startAndEndTimesByWindowId) {
        const windowStartTime = startAndEndTimesByWindowId[playerPosition.windowId].startTimeEpochMs
        return windowStartTime + playerPosition.time
    }
    return null
}

export const convertXToPlayerPosition = (
    xValue: number,
    containerWidth: number,
    segments: RecordingSegment[],
    durationMs: number
): PlayerPosition | null => {
    const playerTime = (xValue / containerWidth) * durationMs
    return getPlayerPositionFromPlayerTime(playerTime, segments)
}

export const convertPlayerPositionToX = (
    playerPosition: PlayerPosition,
    containerWidth: number,
    segments: RecordingSegment[],
    durationMs: number
): number => {
    const playerTime = getPlayerTimeFromPlayerPosition(playerPosition, segments)
    return ((playerTime ?? 0) / durationMs) * containerWidth
}

// Determines whether a given PlayerList row should be expanded or not.
//
// Checks if the row should be expanded depending on the expandable prop that was passed into the component,
// and if it's undeterminable, defaults to the component's local state. This logic is copied over from
// LemonTable and reappropriated for session recordings.
export function getRowExpandedState<T extends Record<string, any>>(
    record: T,
    recordIndex: number,
    expandable?: ExpandableConfig<T>,
    isRowExpandedLocal: boolean = false
): boolean {
    return (
        Number(!!expandable && (!expandable.rowExpandable || expandable.rowExpandable(record, recordIndex))) > 0 &&
        (!expandable?.isRowExpanded || expandable?.isRowExpanded?.(record, recordIndex) === -1
            ? isRowExpandedLocal
            : !!expandable?.isRowExpanded?.(record, recordIndex))
    )
}

export async function addRecordingToPlaylist(
    playlistId: SessionRecordingPlaylistType['short_id'],
    sessionRecordingId: SessionRecordingType['id'],
    silent = false
): Promise<void> {
    await api.recordings.addRecordingToPlaylist(playlistId, sessionRecordingId)
    if (!silent) {
        lemonToast.success('Recording added to playlist', {
            button: {
                label: 'View playlist',
                action: () => router.actions.push(urls.sessionRecordingPlaylist(playlistId)),
            },
        })
    }
}

export async function removeRecordingFromPlaylist(
    playlistId: SessionRecordingPlaylistType['short_id'],
    sessionRecordingId: SessionRecordingType['id'],
    silent = false
): Promise<void> {
    await api.recordings.removeRecordingFromPlaylist(playlistId, sessionRecordingId)
    if (!silent) {
        lemonToast.success('Recording removed from playlist')
    }
}
