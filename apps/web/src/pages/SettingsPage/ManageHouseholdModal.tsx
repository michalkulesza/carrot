import { useCallback, useEffect, useState } from 'react'
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
import { Copy, RefreshCw } from 'react-feather'
import type { HouseholdOut, MemberOut } from '@carrot/shared/types'
import { useMembers } from '@carrot/shared/hooks/useMembers'
import {
  inviteUser,
  leaveHousehold,
  rotateInviteCode,
  updateHousehold,
} from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { buildColorSwatchStyle, PRESET_COLORS } from './helpers'

interface ManageHouseholdModalProps {
  household: HouseholdOut
  isOpen: boolean
  onClose: () => void
  onChanged: () => void
}

interface MembersListProps {
  loading: boolean
  members: MemberOut[]
  isAdmin: boolean
  currentUserId: string | undefined
  busyUserId: string | null
  onRemove: (userId: string) => void
  onPromote: (userId: string) => void
}

const MembersList = ({
  loading,
  members,
  isAdmin,
  currentUserId,
  busyUserId,
  onRemove,
  onPromote,
}: MembersListProps) => {
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
          <span className="w-6 h-6 rounded-full bg-zinc-200 flex items-center justify-center text-xs font-semibold uppercase shrink-0">
            {(m.nickname || m.email)[0]}
          </span>
          <span className="truncate">{m.nickname || m.email}</span>
          {m.role === 'admin' && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-primary bg-primary/10 rounded-full px-2 py-0.5 shrink-0">
              {t('settings.admin')}
            </span>
          )}
          {isAdmin && m.user_id !== currentUserId && (
            <div className="ml-auto flex items-center gap-1 shrink-0">
              {m.role !== 'admin' && (
                <Button
                  size="sm"
                  variant="tertiary"
                  isDisabled={busyUserId === m.user_id}
                  onPress={() => onPromote(m.user_id)}
                >
                  {t('settings.makeAdmin')}
                </Button>
              )}
              <Button
                size="sm"
                variant="danger-soft"
                isDisabled={busyUserId === m.user_id}
                onPress={() => onRemove(m.user_id)}
              >
                {t('common.remove')}
              </Button>
            </div>
          )}
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
  const { user } = useAuth()
  const { members, isLoading: membersLoading, remove, promote } = useMembers(
    isOpen ? household.id : null
  )
  const [name, setName] = useState(household.name)
  const [color, setColor] = useState(household.color)
  const [inviteCode, setInviteCode] = useState(household.invite_code)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [rotating, setRotating] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const currentMember = members.find((m) => m.user_id === user?.id)
  const isAdmin = currentMember?.role === 'admin'

  useEffect(() => {
    if (!isOpen) return
    setName(household.name)
    setColor(household.color)
    setInviteCode(household.invite_code)
    setInviteEmail('')
    setError(null)
    setConfirmLeave(false)
  }, [isOpen, household.name, household.color, household.invite_code])

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) onClose()
    },
    [onClose]
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

  const handleCopyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(inviteCode)
      toast.success(t('settings.codeCopied'), { timeout: 2000 })
    } catch {
      /* clipboard permission denied */
    }
  }, [inviteCode, t])

  const handleRotateCode = useCallback(async () => {
    setRotating(true)
    setError(null)
    try {
      const updated = await rotateInviteCode(household.id)
      setInviteCode(updated.invite_code)
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings.failedToSave'))
    } finally {
      setRotating(false)
    }
  }, [household.id, onChanged, t])

  const handleRemoveMember = useCallback(
    async (userId: string) => {
      setBusyUserId(userId)
      try {
        await remove.mutateAsync(userId)
      } catch (e) {
        setError(e instanceof Error ? e.message : t('settings.failedToSave'))
      } finally {
        setBusyUserId(null)
      }
    },
    [remove, t]
  )

  const handlePromoteMember = useCallback(
    async (userId: string) => {
      setBusyUserId(userId)
      try {
        await promote.mutateAsync(userId)
      } catch (e) {
        setError(e instanceof Error ? e.message : t('settings.failedToSave'))
      } finally {
        setBusyUserId(null)
      }
    },
    [promote, t]
  )

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
                  {t('settings.inviteCode')}
                </p>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-lg tracking-widest px-3 py-1.5 rounded-lg bg-zinc-100 flex-1 text-center">
                    {inviteCode}
                  </span>
                  <Button size="sm" variant="secondary" onPress={handleCopyCode}>
                    <Copy size={14} />
                  </Button>
                  {isAdmin && (
                    <Button
                      size="sm"
                      variant="secondary"
                      isDisabled={rotating}
                      onPress={handleRotateCode}
                    >
                      <RefreshCw size={14} />
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  {t('settings.members')}
                </p>
                <MembersList
                  loading={membersLoading}
                  members={members}
                  isAdmin={isAdmin}
                  currentUserId={user?.id}
                  busyUserId={busyUserId}
                  onRemove={handleRemoveMember}
                  onPromote={handlePromoteMember}
                />
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
