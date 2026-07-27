import { useCallback, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, toast } from '@heroui/react'
import type { InvitationOut } from '@carrot/shared/types'
import { useHouseholds } from '@carrot/shared/hooks/useHouseholds'
import { acceptInvitation } from '../api/client'
import { useHousehold } from '../context/HouseholdContext'
import CreateHouseholdModal from '../pages/SettingsPage/CreateHouseholdModal'

interface GateInvitationRowProps {
  invitation: InvitationOut
  busy: boolean
  onAccept: (id: string) => void
}

const GateInvitationRow = ({
  invitation,
  busy,
  onAccept,
}: GateInvitationRowProps) => {
  const { t } = useTranslation()
  const handleAccept = useCallback(
    () => onAccept(invitation.id),
    [invitation.id, onAccept]
  )

  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">
          {invitation.household_name}
        </p>
        <p className="text-xs text-zinc-400">
          {t('bell.from', {
            name: invitation.invited_by_nickname || invitation.invited_by_email,
          })}
        </p>
      </div>
      <Button size="sm" variant="primary" isDisabled={busy} onPress={handleAccept}>
        {t('common.accept')}
      </Button>
    </li>
  )
}

const HouseholdGate = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation()
  const { households, isLoadingHouseholds, invitations, refetchInvitations, refetchHouseholds } =
    useHousehold()
  const { joinByCode } = useHouseholds()
  const [busyInvitationId, setBusyInvitationId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const handleAcceptInvitation = useCallback(
    async (id: string) => {
      setBusyInvitationId(id)
      try {
        await acceptInvitation(id)
        refetchInvitations()
        refetchHouseholds()
        toast.success(t('bell.joinedHousehold'), { timeout: 3000 })
      } catch (e) {
        toast.danger(
          e instanceof Error ? e.message : t('bell.acceptInvitationFailed'),
          { timeout: 3000 }
        )
      } finally {
        setBusyInvitationId(null)
      }
    },
    [refetchInvitations, refetchHouseholds, t]
  )

  const handleJoinSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      if (!code.trim()) return
      setJoining(true)
      setJoinError(null)
      try {
        await joinByCode.mutateAsync(code.trim())
        setCode('')
      } catch (err) {
        setJoinError(
          err instanceof Error ? err.message : t('households.joinFailed')
        )
      } finally {
        setJoining(false)
      }
    },
    [code, joinByCode, t]
  )

  const handleCreateOpen = useCallback(() => setCreateOpen(true), [])
  const handleCreateClose = useCallback(() => setCreateOpen(false), [])

  if (isLoadingHouseholds) return null
  if (households.length > 0) return <>{children}</>

  return (
    <div className="flex items-center justify-center px-4 py-10 min-h-[calc(100vh-4rem)]">
      <div className="w-full max-w-sm flex flex-col gap-6 py-10">
        <div className="text-center">
          <h1 className="text-xl font-semibold">{t('households.gateTitle')}</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {t('households.gateSubtitle')}
          </p>
        </div>

        {invitations.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              {t('households.pendingInvitations')}
            </p>
            <ul className="flex flex-col gap-2">
              {invitations.map((inv) => (
                <GateInvitationRow
                  key={inv.id}
                  invitation={inv}
                  busy={busyInvitationId === inv.id}
                  onAccept={handleAcceptInvitation}
                />
              ))}
            </ul>
          </div>
        )}

        <form
          onSubmit={handleJoinSubmit}
          className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4"
        >
          <label
            className="text-xs font-semibold uppercase tracking-wide text-zinc-400"
            htmlFor="gate-invite-code"
          >
            {t('households.haveACode')}
          </label>
          <div className="flex gap-2">
            <input
              id="gate-invite-code"
              type="text"
              autoCapitalize="characters"
              placeholder={t('households.codePlaceholder')}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="flex-1 px-3 py-2 text-sm rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono tracking-widest uppercase"
            />
            <Button type="submit" variant="secondary" isDisabled={joining}>
              {t('households.join')}
            </Button>
          </div>
          {joinError && <p className="text-sm text-danger">{joinError}</p>}
        </form>

        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <div className="flex-1 h-px bg-zinc-200" />
          <span>{t('common.or')}</span>
          <div className="flex-1 h-px bg-zinc-200" />
        </div>

        <Button variant="primary" onPress={handleCreateOpen}>
          {t('settings.newHousehold')}
        </Button>
      </div>

      <CreateHouseholdModal
        isOpen={createOpen}
        onClose={handleCreateClose}
        onCreated={refetchHouseholds}
      />
    </div>
  )
}

export default HouseholdGate
