import { useValues, useActions } from 'kea'
import { userLogic } from 'scenes/userLogic'
import { LemonButton, LemonModal } from '@posthog/lemon-ui'
import { IconCheckmark, IconWarning } from 'lib/lemon-ui/icons'
import { useState } from 'react'
import { Setup2FA } from 'scenes/authentication/Setup2FA'
import { membersLogic } from 'scenes/organization/Settings/membersLogic'

export function TwoFactorAuthentication(): JSX.Element {
    const { user } = useValues(userLogic)
    const { updateUser } = useActions(userLogic)
    const { loadMembers } = useActions(membersLogic)
    const [modalVisible, setModalVisible] = useState(false)

    return (
        <div className="flex flex-col">
            {modalVisible && (
                <LemonModal title="Set up or manage 2FA" onClose={() => setModalVisible(false)}>
                    <>
                        <b>
                            Use an authenticator app like Google Authenticator or 1Password to scan the QR code below.
                        </b>
                        <Setup2FA
                            onSuccess={() => {
                                setModalVisible(false)
                                updateUser({})
                                loadMembers()
                            }}
                        />
                    </>
                </LemonModal>
            )}

            {user?.is_2fa_enabled ? (
                <>
                    <div>
                        <IconCheckmark color="green" />
                        <b>2FA enabled.</b>
                    </div>
                    <br />
                    <div className="w-60">
                        <LemonButton type="primary" to="/account/two_factor/" targetBlank={true}>
                            Manage or disable 2FA
                        </LemonButton>
                    </div>
                </>
            ) : (
                <div>
                    <div className="mb-2">
                        <IconWarning color="orange" />
                        <b>2FA is not enabled.</b>
                    </div>
                    <LemonButton type="primary" onClick={() => setModalVisible(true)}>
                        Set up 2FA
                    </LemonButton>
                </div>
            )}
        </div>
    )
}
