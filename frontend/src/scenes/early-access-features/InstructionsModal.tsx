import { LemonCollapse, LemonModal, Link } from '@posthog/lemon-ui'
import { CodeSnippet, Language } from 'lib/components/CodeSnippet'
import { FeatureFlagType } from '~/types'
import EarlyAccessFeatureImage from 'public/early-access-feature-demo.png'
import { preflightLogic } from 'scenes/PreflightCheck/preflightLogic'
import { useValues } from 'kea'

interface InstructionsModalProps {
    featureFlag: FeatureFlagType
    visible: boolean
    onClose: () => void
}

export function InstructionsModal({ onClose, visible, featureFlag }: InstructionsModalProps): JSX.Element {
    const { preflight } = useValues(preflightLogic)

    const getCloudPanels = (): JSX.Element => (
        <LemonCollapse
            className="mt-2"
            defaultActiveKey="1"
            panels={[
                {
                    key: '1',
                    header: 'Option 1: Widget Site App',
                    content: (
                        <div>
                            Give your users a{' '}
                            <Link to={'https://app.posthog.com/project/apps/574'}>prebuilt widget</Link> to opt-in to
                            features
                            <img
                                style={{ maxHeight: '100%', maxWidth: '100%', marginTop: 10 }}
                                src={EarlyAccessFeatureImage}
                            />
                        </div>
                    ),
                },
                {
                    key: '2',
                    header: 'Option 2: Custom implementation',
                    content: (
                        <div>
                            <b>Opt user in</b>
                            <div>
                                <FeatureEnrollInstructions featureFlag={featureFlag} />
                            </div>

                            <b>Opt user out</b>
                            <div>
                                <FeatureUnenrollInstructions featureFlag={featureFlag} />
                            </div>

                            <b>Retrieve Previews</b>
                            <div>
                                <RetrievePreviewsInstructions featureFlag={featureFlag} />
                            </div>
                        </div>
                    ),
                },
            ]}
        />
    )

    const getSelfHostedPanels = (): JSX.Element => (
        <div>
            <b>Opt user in</b>
            <div>
                <FeatureEnrollInstructions featureFlag={featureFlag} />
            </div>

            <b>Opt user out</b>
            <div>
                <FeatureUnenrollInstructions featureFlag={featureFlag} />
            </div>

            <b>Retrieve Previews</b>
            <div>
                <RetrievePreviewsInstructions featureFlag={featureFlag} />
            </div>
        </div>
    )

    const panels: JSX.Element = preflight?.cloud ? getCloudPanels() : getSelfHostedPanels()

    return (
        <LemonModal title="How to implement opt-in feature flags" isOpen={visible} onClose={onClose} width={640}>
            <div>
                <div className="mb-2">
                    Implement manual release condition toggles to give your users the ability choose which features they
                    want to try
                </div>
                {panels}
            </div>
        </LemonModal>
    )
}

function FeatureEnrollInstructions({ featureFlag }: { featureFlag: FeatureFlagType }): JSX.Element {
    return (
        <CodeSnippet language={Language.JavaScript} wrap>
            {`posthog.updateFeaturePreviewEnrollment("${featureFlag.key}", true)
`}
        </CodeSnippet>
    )
}

function FeatureUnenrollInstructions({ featureFlag }: { featureFlag: FeatureFlagType }): JSX.Element {
    return (
        <CodeSnippet language={Language.JavaScript} wrap>
            {`posthog.updateFeaturePreviewEnrollment("${featureFlag.key}", false)
`}
        </CodeSnippet>
    )
}

function RetrievePreviewsInstructions({ featureFlag }: { featureFlag: FeatureFlagType }): JSX.Element {
    return (
        <CodeSnippet language={Language.JavaScript} wrap>
            {`posthog.getFeaturePreviews()
// Example response:
// {
//     flagKey: '${featureFlag.key}',
// }
`}
        </CodeSnippet>
    )
}
