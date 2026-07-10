import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Button,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  toast,
} from '@heroui/react'
import type { HouseholdOut, MemberOut } from '@carrot/shared/types'
import {
  inviteUser,
  leaveHousehold,
  listMembers,
  updateHousehold,
} from '../../api/client'
import { buildColorSwatchStyle, PRESET_COLORS } from './helpers'

interface ManageHouseholdModalProps {
  household: HouseholdOut
  isOpen: boolean
  onClose: () => void
  onChanged: () => void
}

const MembersList = ({
  loading,
  members,
}: {
  loading: boolean
  members: MemberOut[]
}) => {
  const { t } = useTranslation()

  if (loading) {
    return <p className="text-sm text-zinc-400">{t('common.loading')}</p>
  }

  return (
    <ul className="flex flex-col gap-1">
      {members.map((m) => (
        <li
          key={m.user_id.toString()}
          className="text-sm flex items-center gap-2"
        >
          <span className="w-6 h-6 rounded-full bg-zinc-200 flex items-center justify-center text-xs font-semibold uppercase">
            {(m.nickname || m.email)[0]}
          </span>
          <span className="truncate">{m.nickname || m.email}</span>
        </li>
      ))}
    </ul>
  )
}

const ManageHouseholdModal = ({
  household,
  isOpen,
  onClose,
  onChanged,
}: ManageHouseholdModalProps) => {
  const { t } = useTranslation()
  const [members, setMembers] = useState<MemberOut[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [name, setName] = useState(household.name)
  const [color, setColor] = useState(household.color)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadMembers = useCallback(async () => {
    setMembersLoading(true)
    try {
      const m = await listMembers(household.id)
      setMembers(m)
    } catch {
      // members list is non-critical; leave it empty on failure
    } finally {
      setMembersLoading(false)
    }
  }, [household.id])

  const handleOpen = useCallback(() => {
    setName(household.name)
    setColor(household.color)
    setInviteEmail('')
    setError(null)
    setConfirmLeave(false)
    loadMembers()
  }, [household.name, household.color, loadMembers])

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) onClose()
      if (open) handleOpen()
    },
    [onClose, handleOpen]
  )

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      await updateHousehold(household.id, {
        name: name.trim() || household.name,
        color,
      })
      toast.success(t('settings.saved'), { timeout: 2000 })
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings.failedToSave'))
    } finally {
      setSaving(false)
    }
  }, [household.id, household.name, name, color, onChanged, t])

  const handleInvite = useCallback(async () => {
    if (!inviteEmail.trim()) return
    setInviting(true)
    setError(null)
    try {
      await inviteUser(household.id, inviteEmail.trim())
      toast.success(t('settings.invitationSent'), { timeout: 3000 })
      setInviteEmail('')
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings.invitationFailed'))
    } finally {
      setInviting(false)
    }
  }, [household.id, inviteEmail, t])

  const handleLeave = useCallback(async () => {
    setLeaving(true)
    try {
      await leaveHousehold(household.id)
      toast(t('settings.leftHousehold'), { timeout: 3000 })
      onChanged()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings.leaveFailed'))
      setLeaving(false)
    }
  }, [household.id, onChanged, onClose, t])

  return (
    <Modal isOpen={isOpen} onOpenChange={handleOpenChange}>
      <ModalBackdrop isDismissable>
        <ModalContainer size="sm" className="!rounded-xl overflow-hidden">
          <ModalDialog>
            <ModalHeader>{t('settings.manageHousehold')}</ModalHeader>
            <ModalBody className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  {t('settings.nameLabel')}
                </p>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="px-3 py-1.5 text-sm rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  {t('settings.colorLabel')}
                </p>
                <div className="flex gap-2 flex-wrap">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                      style={buildColorSwatchStyle(c, color)}
                      onClick={() => setColor(c)}
                    />
                  ))}
                </div>
              </div>

              <Button
                size="sm"
                variant="secondary"
                onPress={handleSave}
                isDisabled={saving}
              >
                {t('settings.saveChanges')}
              </Button>

              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  {t('settings.members')}
                </p>
                <MembersList loading={membersLoading} members={members} />
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  {t('settings.inviteByEmail')}
                </p>
                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder={t('settings.inviteEmailPlaceholder')}
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    isDisabled={inviting}
                    onPress={handleInvite}
                  >
                    {t('common.invite')}
                  </Button>
                </div>
              </div>

              {error && <p className="text-sm text-danger">{error}</p>}

              <div className="border-t border-zinc-200 pt-3">
                {!confirmLeave ? (
                  <Button
                    size="sm"
                    variant="danger-soft"
                    onPress={() => setConfirmLeave(true)}
                  >
                    {t('settings.leaveHousehold')}
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-danger font-medium">
                      {t('settings.areYouSure')}
                    </span>
                    <Button
                      size="sm"
                      variant="danger"
                      isDisabled={leaving}
                      onPress={handleLeave}
                    >
                      {t('settings.leaveHousehold')}
                    </Button>
                    <Button
                      size="sm"
                      variant="tertiary"
                      onPress={() => setConfirmLeave(false)}
                    >
                      {t('common.cancel')}
                    </Button>
                  </div>
                )}
              </div>
            </ModalBody>
            <ModalFooter>
              <Button variant="tertiary" onPress={onClose}>
                {t('common.close')}
              </Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  )
}

export default ManageHouseholdModal
