import { useCallback, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, toast } from '@heroui/react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import type { InvitationOut } from '@carrot/shared/types'
import { useHouseholds } from '@carrot/shared/hooks/useHouseholds'
import { acceptInvitation } from '../api/client'
import { useHousehold } from '../context/HouseholdContext'
import CreateHouseholdModal from '../pages/SettingsPage/CreateHouseholdModal'

gsap.registerPlugin(useGSAP)

const INVITE_CODE_PATTERN = /^[A-Z0-9]{8}$/i
const CODE_BOX_IDLE_COLORS = { backgroundColor: '#ffffff', borderColor: '#e4e4e7', backgroundImage: 'none' }
const CODE_LABEL_VALID_COLOR = { color: 'rgba(255,255,255,0.85)' }
const CODE_LABEL_IDLE_COLOR = { color: '#a1a1aa' }
const SHIMMER_GRADIENT =
  'linear-gradient(120deg, #d97a3a 0%, #ea8e4e 30%, #f6c199 50%, #ea8e4e 70%, #d97a3a 100%)'

// Builds (and returns) a timeline that morphs a box + its label between idle
// and "active" (orange) states, with a slow looping gradient shimmer while
// active. useGSAP reverts everything this creates whenever `active` flips,
// so the shimmer tween is automatically killed on deactivation.
const buildGlowTimeline = (
  box: HTMLElement,
  label: HTMLElement | null,
  active: boolean
) => {
  const tl = gsap.timeline({ defaults: { duration: 0.4, ease: 'power2.out' } })
  if (active) {
    tl.set(box, {
      backgroundImage: SHIMMER_GRADIENT,
      backgroundSize: '200% 100%',
      backgroundPosition: '0% 0%',
    })
    tl.to(box, { borderColor: '#ea8e4e' }, 0)
    if (label) tl.to(label, CODE_LABEL_VALID_COLOR, 0)
    tl.fromTo(
      box,
      { scale: 1 },
      { scale: 1.02, duration: 0.18, ease: 'power2.out', yoyo: true, repeat: 1 },
      0
    )
    tl.to(
      box,
      { backgroundPosition: '100% 0%', duration: 3, ease: 'sine.inOut', yoyo: true, repeat: -1 },
      0.3
    )
  } else {
    tl.to(box, CODE_BOX_IDLE_COLORS, 0)
    if (label) tl.to(label, CODE_LABEL_IDLE_COLOR, 0)
  }
  return tl
}

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

// TEMP: dev-only fake invitation for visually testing the "Have you been
// invited?" box. Remove before committing.
const FAKE_DEV_INVITATION: InvitationOut = {
  id: 'fake-dev-invitation',
  household_id: 'fake-household',
  household_name: "Kulesza Family",
  invited_by_email: 'alt@demo.com',
  invited_by_nickname: 'Alt Demo',
  created_at: new Date().toISOString(),
}

const HouseholdGate = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation()
  const { households, isLoadingHouseholds, invitations: realInvitations, refetchInvitations, refetchHouseholds } =
    useHousehold()
  const isDev = (import.meta as unknown as { env: { DEV: boolean } }).env.DEV
  const invitations = isDev && realInvitations.length === 0
    ? [FAKE_DEV_INVITATION]
    : realInvitations
  const { joinByCode } = useHouseholds()
  const [busyInvitationId, setBusyInvitationId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const isValidCode = INVITE_CODE_PATTERN.test(code.trim())
  const showValidColors = isValidCode && !joinError
  const hasInvitations = invitations.length > 0
  const codeBoxRef = useRef<HTMLFormElement>(null)
  const codeLabelRef = useRef<HTMLLabelElement>(null)
  const inviteBoxRef = useRef<HTMLDivElement>(null)
  const inviteLabelRef = useRef<HTMLParagraphElement>(null)

  useGSAP(
    () => {
      if (!codeBoxRef.current) return
      buildGlowTimeline(codeBoxRef.current, codeLabelRef.current, showValidColors)
    },
    { dependencies: [showValidColors, isLoadingHouseholds], scope: codeBoxRef }
  )

  useGSAP(
    () => {
      if (!inviteBoxRef.current) return
      buildGlowTimeline(inviteBoxRef.current, inviteLabelRef.current, hasInvitations)
    },
    { dependencies: [hasInvitations, isLoadingHouseholds], scope: inviteBoxRef }
  )

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
      if (!isValidCode) return
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
    [code, isValidCode, joinByCode, t]
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

        <form
          ref={codeBoxRef}
          onSubmit={handleJoinSubmit}
          className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4"
        >
          <label
            ref={codeLabelRef}
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
              maxLength={8}
              placeholder={t('households.codePlaceholder')}
              value={code}
              onChange={(e) => {
                setCode(e.target.value)
                setJoinError(null)
              }}
              className="flex-1 px-3 py-2 text-sm rounded-lg border border-zinc-200 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono tracking-widest uppercase"
            />
            <Button type="submit" variant="secondary" isDisabled={joining || !isValidCode}>
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

        <div
          ref={inviteBoxRef}
          className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4"
        >
          <p
            ref={inviteLabelRef}
            className="text-xs font-semibold uppercase tracking-wide text-zinc-400"
          >
            {t('households.haveYouBeenInvited')}
          </p>
          {invitations.length > 0 ? (
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
          ) : (
            <div className="flex items-center justify-center rounded-lg border border-dashed border-zinc-300 p-4">
              <p className="text-sm text-zinc-400">
                {t('households.noPendingInvites')}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <div className="flex-1 h-px bg-zinc-200" />
          <span>{t('common.or')}</span>
          <div className="flex-1 h-px bg-zinc-200" />
        </div>

        <div className="flex justify-center">
          <Button variant="primary" onPress={handleCreateOpen}>
            {t('households.createAHousehold')}
          </Button>
        </div>
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
