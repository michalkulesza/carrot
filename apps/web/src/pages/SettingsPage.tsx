import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Button,
  Checkbox,
  Description,
  Disclosure,
  Label,
  ListBox,
  ListBoxItem,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  Select,
  Switch,
  toast,
} from '@heroui/react'
import {
  useTimers,
  getRemainingSeconds,
  formatCountdown,
} from '../context/TimerContext'
import PageHeader from '../components/PageHeader'
import type { AllergenData, RecipeStats, UserPreferences, MemberOut, HouseholdOut } from '@platekeeper/shared/types'
import {
  exportRecipes,
  importRecipes,
  updatePreferences,
  updateHouseholdAllergens,
  streamReanalyze,
  createHousehold,
  leaveHousehold,
  listMembers,
  updateHousehold,
  inviteUser,
} from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useHousehold } from '../context/HouseholdContext'

const StatCard = ({
  value,
  label,
}: {
  value: string | number | null
  label: string
}) => {
  return (
    <div className="flex-1 flex flex-col items-center gap-1 rounded-xl bg-zinc-50 py-4 px-2">
      <span className="text-2xl font-bold text-zinc-800">{value ?? '—'}</span>
      <span className="text-xs text-zinc-400 text-center">{label}</span>
    </div>
  )
}

const WEEK_DAY_OPTIONS = [
  { key: '1', labelKey: 'settings.monday' },
  { key: '0', labelKey: 'settings.sunday' },
  { key: '6', labelKey: 'settings.saturday' },
]

const PRESET_COLORS = [
  '#6366f1',
  '#ec4899',
  '#14b8a6',
  '#f59e0b',
  '#22c55e',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
]

const ALLERGEN_KEYS = [
  'gluten',
  'crustaceans',
  'tree nuts',
  'celery',
  'mustard',
  'sulphites',
  'lupin',
  'molluscs',
  'eggs',
  'fish',
  'peanuts',
  'soybeans',
  'milk',
  'sesame',
]

const INTOLERANCE_KEYS = [
  'lactose',
  'ncgs',
  'fructose',
  'histamine',
  'fodmap',
  'caffeine',
  'sulphite-sensitivity',
  'sorbitol',
  'salicylates',
  'msg',
]

interface SettingsPageProps {
  stats: RecipeStats | null
  onStatsRefresh: () => void
  preferences: UserPreferences | null
  onPreferencesChange: (prefs: UserPreferences) => void
}

const CheckboxGroup = ({
  keys,
  namespace,
  predefined,
  onToggle,
}: {
  keys: string[]
  namespace: 'allergens' | 'intolerances'
  predefined: string[]
  onToggle: (key: string) => void
}) => {
  const { t } = useTranslation()
  const iKey = (k: string) => k.replace(/[- ]/g, '_')

  return (
    <div className="flex flex-col gap-3 pt-1">
      {keys.map((key) => {
        const k = iKey(key)
        const desc = t(`${namespace}.${k}_desc`, { defaultValue: '' })

        return (
          <Checkbox
            key={key}
            isSelected={predefined.includes(key)}
            onChange={() => onToggle(key)}
          >
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Checkbox.Content>
              <Label>{t(`${namespace}.${k}`)}</Label>
              {desc && <Description>{desc}</Description>}
            </Checkbox.Content>
          </Checkbox>
        )
      })}
    </div>
  )
}

// ── Allergen section ──────────────────────────────────────────────────────────

const AllergenSection = ({
  allergens,
  scopeLabel,
  onSave,
}: {
  allergens: AllergenData
  scopeLabel: string
  onSave: (data: AllergenData) => Promise<void>
}) => {
  const { t } = useTranslation()
  const [predefined, setPredefined] = useState<string[]>(
    allergens.predefined ?? []
  )
  const [custom, setCustom] = useState<string[]>(allergens.custom ?? [])
  const [tagInput, setTagInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [reanalyzing, setReanalyzing] = useState(false)
  const [reanalyzeProgress, setReanalyzeProgress] = useState<{
    done: number
    total: number
  } | null>(null)

  const togglePredefined = (key: string) => {
    setPredefined((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  const addCustomTag = () => {
    const tag = tagInput.trim().toLowerCase()
    if (tag && !custom.includes(tag)) {
      setCustom((prev) => [...prev, tag])
    }
    setTagInput('')
  }

  const removeCustomTag = (tag: string) => {
    setCustom((prev) => prev.filter((t) => t !== tag))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({ predefined, custom })
      toast.success(t('settings.allergensSaved'), { timeout: 2000 })
    } catch (e) {
      toast.danger(
        e instanceof Error ? e.message : t('settings.failedToSave'),
        { timeout: 3000 }
      )
    } finally {
      setSaving(false)
    }
  }

  const handleReanalyze = () => {
    setReanalyzing(true)
    setReanalyzeProgress({ done: 0, total: 0 })
    streamReanalyze({
      onStart: (total) => setReanalyzeProgress({ done: 0, total }),
      onProgress: (done, total) => setReanalyzeProgress({ done, total }),
      onComplete: (analyzed) => {
        setReanalyzing(false)
        setReanalyzeProgress(null)
        toast.success(t('settings.reanalyzedRecipes', { count: analyzed }), {
          timeout: 3000,
        })
      },
      onError: (msg) => {
        setReanalyzing(false)
        setReanalyzeProgress(null)
        toast.danger(msg, { timeout: 3000 })
      },
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-zinc-400">{scopeLabel}</p>

      <div className="flex flex-col divide-y divide-zinc-100">
        <Disclosure>
          <Disclosure.Heading>
            <Disclosure.Trigger className="w-full flex items-center justify-between py-2 text-sm font-medium text-zinc-700">
              {t('settings.allergens')}
              <Disclosure.Indicator />
            </Disclosure.Trigger>
          </Disclosure.Heading>
          <Disclosure.Content>
            <Disclosure.Body className="pb-3">
              <CheckboxGroup
                keys={ALLERGEN_KEYS}
                namespace="allergens"
                predefined={predefined}
                onToggle={togglePredefined}
              />
            </Disclosure.Body>
          </Disclosure.Content>
        </Disclosure>

        <Disclosure>
          <Disclosure.Heading>
            <Disclosure.Trigger className="w-full flex items-center justify-between py-2 text-sm font-medium text-zinc-700">
              {t('settings.intolerances')}
              <Disclosure.Indicator />
            </Disclosure.Trigger>
          </Disclosure.Heading>
          <Disclosure.Content>
            <Disclosure.Body className="pb-3">
              <CheckboxGroup
                keys={INTOLERANCE_KEYS}
                namespace="intolerances"
                predefined={predefined}
                onToggle={togglePredefined}
              />
            </Disclosure.Body>
          </Disclosure.Content>
        </Disclosure>

        <Disclosure>
          <Disclosure.Heading>
            <Disclosure.Trigger className="w-full flex items-center justify-between py-2 text-sm font-medium text-zinc-700">
              {t('settings.custom')}
              <Disclosure.Indicator />
            </Disclosure.Trigger>
          </Disclosure.Heading>
          <Disclosure.Content>
            <Disclosure.Body className="pb-3 flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder={t('settings.customPlaceholder')}
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addCustomTag()
                    }
                  }}
                  className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <Button size="sm" variant="secondary" onPress={addCustomTag}>
                  {t('common.add')}
                </Button>
              </div>
              {custom.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {custom.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-zinc-100 text-zinc-600"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeCustomTag(tag)}
                        className="text-zinc-400 hover:text-zinc-700 ml-0.5"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </Disclosure.Body>
          </Disclosure.Content>
        </Disclosure>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button
          size="sm"
          variant="primary"
          onPress={handleSave}
          isDisabled={saving}
        >
          {saving ? t('common.saving') : t('common.save')}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onPress={handleReanalyze}
          isDisabled={reanalyzing}
        >
          {reanalyzing
            ? reanalyzeProgress && reanalyzeProgress.total > 0
              ? t('settings.analyzingProgress', {
                  done: reanalyzeProgress.done,
                  total: reanalyzeProgress.total,
                })
              : t('settings.starting')
            : t('settings.reAnalyzeRecipes')}
        </Button>
      </div>
    </div>
  )
}

// ── Create Household modal ────────────────────────────────────────────────────

const CreateHouseholdModal = ({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean
  onClose: () => void
  onCreated: () => void
}) => {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [color, setColor] = useState(PRESET_COLORS[0])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    setBusy(true)
    setError(null)
    try {
      await createHousehold(name.trim() || undefined, color)
      toast.success(t('settings.householdCreated'), { timeout: 3000 })
      setName('')
      setColor(PRESET_COLORS[0])
      onCreated()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create household')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <ModalBackdrop isDismissable>
        <ModalContainer size="sm" className="!rounded-xl overflow-hidden">
          <ModalDialog>
            <ModalHeader>{t('settings.newHouseholdTitle')}</ModalHeader>
            <ModalBody className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium" htmlFor="household-name">
                  {t('settings.householdNameOptional')}
                </label>
                <input
                  id="household-name"
                  type="text"
                  placeholder={t('settings.householdNamePlaceholder')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="px-3 py-2 text-sm rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <p className="text-sm font-medium mb-2">
                  {t('settings.colorLabel')}
                </p>
                <div className="flex gap-2 flex-wrap">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="w-8 h-8 rounded-full border-2 transition-transform hover:scale-110"
                      style={{
                        backgroundColor: c,
                        borderColor: color === c ? 'white' : 'transparent',
                        boxShadow: color === c ? `0 0 0 2px ${c}` : undefined,
                      }}
                      onClick={() => setColor(c)}
                    />
                  ))}
                </div>
              </div>
              {error && <p className="text-sm text-danger">{error}</p>}
            </ModalBody>
            <ModalFooter>
              <Button variant="tertiary" onPress={onClose}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                onPress={handleCreate}
                isDisabled={busy}
              >
                {t('common.create')}
              </Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  )
}

// ── Manage Household modal ────────────────────────────────────────────────────

const ManageHouseholdModal = ({
  household,
  isOpen,
  onClose,
  onChanged,
}: {
  household: HouseholdOut
  isOpen: boolean
  onClose: () => void
  onChanged: () => void
}) => {
  const { t } = useTranslation()
  const [members, setMembers] = useState<MemberOut[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [name, setName] = useState(household.name)
  const [color, setColor] = useState(household.color)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadMembers = async () => {
    setMembersLoading(true)
    try {
      const m = await listMembers(household.id)
      setMembers(m)
    } catch {
      /* ignore */
    } finally {
      setMembersLoading(false)
    }
  }

  const handleOpen = () => {
    setName(household.name)
    setColor(household.color)
    setInviteEmail('')
    setError(null)
    setConfirmLeave(false)
    loadMembers()
  }

  const handleSave = async () => {
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
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return
    setBusy(true)
    setError(null)
    try {
      await inviteUser(household.id, inviteEmail.trim())
      toast.success(t('settings.invitationSent'), { timeout: 3000 })
      setInviteEmail('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to invite')
    } finally {
      setBusy(false)
    }
  }

  const handleLeave = async () => {
    setLeaving(true)
    try {
      await leaveHousehold(household.id)
      toast(t('settings.leftHousehold'), { timeout: 3000 })
      onChanged()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to leave')
      setLeaving(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose()
        if (open) handleOpen()
      }}
    >
      <ModalBackdrop isDismissable>
        <ModalContainer size="sm" className="!rounded-xl overflow-hidden">
          <ModalDialog>
            <ModalHeader>{t('settings.manageHousehold')}</ModalHeader>
            <ModalBody className="flex flex-col gap-5">
              {/* Rename */}
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

              {/* Recolor */}
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
                      style={{
                        backgroundColor: c,
                        borderColor: color === c ? 'white' : 'transparent',
                        boxShadow: color === c ? `0 0 0 2px ${c}` : undefined,
                      }}
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

              {/* Members */}
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  {t('settings.members')}
                </p>
                {membersLoading ? (
                  <p className="text-sm text-zinc-400">{t('common.loading')}</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {members.map((m) => (
                      <li
                        key={m.user_id.toString()}
                        className="text-sm flex items-center gap-2"
                      >
                        <span className="w-6 h-6 rounded-full bg-zinc-200 flex items-center justify-center text-xs font-semibold uppercase">
                          {(m.nickname || m.email)[0]}
                        </span>
                        <span className="truncate">
                          {m.nickname || m.email}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Invite */}
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

              {/* Leave */}
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

// ── Timer settings section ────────────────────────────────────────────────────

const TimerSettingsSection = () => {
  const {
    timers,
    pauseTimer,
    resumeTimer,
    cancelTimer,
    wakeLockTimersEnabled,
    setWakeLockTimersEnabled,
  } = useTimers()
  const { t } = useTranslation()
  const timerList = [...timers.values()]

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {t('settings.timers')}
      </h2>
      <div className="rounded-xl border border-zinc-200 bg-white p-4 flex flex-col gap-4">
        {timerList.length > 0 ? (
          <div className="flex flex-col divide-y divide-zinc-100">
            {timerList.map((timer) => {
              const remaining = getRemainingSeconds(timer)

              return (
                <div key={timer.id} className="flex items-center gap-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {timer.recipeTitle}
                    </p>
                    <p className="text-xs text-zinc-400 truncate">
                      {t('common.step')} {timer.stepIndex + 1}:{' '}
                      {timer.stepText.length > 55
                        ? timer.stepText.slice(0, 52) + '…'
                        : timer.stepText}
                    </p>
                  </div>
                  <span
                    className={`font-mono text-sm font-semibold tabular-nums shrink-0 ${
                      timer.status === 'done'
                        ? 'text-emerald-600'
                        : timer.status === 'paused'
                          ? 'text-zinc-400'
                          : 'text-amber-600'
                    }`}
                  >
                    {timer.status === 'done'
                      ? t('common.doneCheck')
                      : formatCountdown(remaining)}
                  </span>
                  <div className="flex gap-0.5 shrink-0">
                    {timer.status === 'running' && (
                      <button
                        type="button"
                        onClick={() => pauseTimer(timer.id)}
                        className="w-7 h-7 flex items-center justify-center rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700"
                        title={t('common.pause')}
                      >
                        ⏸
                      </button>
                    )}
                    {timer.status === 'paused' && (
                      <button
                        type="button"
                        onClick={() => resumeTimer(timer.id)}
                        className="w-7 h-7 flex items-center justify-center rounded hover:bg-zinc-100 text-zinc-400 hover:text-amber-600"
                        title={t('common.resume')}
                      >
                        ▶
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => cancelTimer(timer.id)}
                      className="w-7 h-7 flex items-center justify-center rounded hover:bg-zinc-100 text-zinc-400 hover:text-danger"
                      title={t('common.cancel')}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-zinc-400">{t('timers.noTimers')}</p>
        )}

        {'wakeLock' in navigator && (
          <div className="flex items-center justify-between gap-2 pt-3 border-t border-zinc-100">
            <div>
              <p className="text-sm font-medium">{t('timers.keepScreenOn')}</p>
              <p className="text-xs text-zinc-400">
                {t('timers.keepScreenOnDesc')}
              </p>
            </div>
            <Switch
              size="sm"
              isSelected={wakeLockTimersEnabled}
              onChange={setWakeLockTimersEnabled}
            >
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch>
          </div>
        )}
      </div>
    </section>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

const SettingsPage = ({
  stats,
  onStatsRefresh,
  preferences,
  onPreferencesChange,
}: SettingsPageProps) => {
  const { user, logout } = useAuth()
  const { households, activeHouseholdId, activeHousehold, refetchHouseholds } =
    useHousehold()
  const { t, i18n } = useTranslation()
  const [wakeLockDefault, setWakeLockDefault] = useState(
    () => localStorage.getItem('wakelock-default') === '1'
  )
  const [loggingOut, setLoggingOut] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)
  const [managingHousehold, setManagingHousehold] =
    useState<HouseholdOut | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const displayName = user?.nickname || user?.email || ''

  const handleLogout = async () => {
    setLogoutConfirmOpen(false)
    setLoggingOut(true)
    await logout()
  }

  const handleExport = async () => {
    setExporting(true)
    setError(null)
    try {
      await exportRecipes()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportResult(null)
    setError(null)
    try {
      const { imported } = await importRecipes(file)
      setImportResult(t('settings.importedRecipes', { count: imported }))
      onStatsRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleSaveAllergens = async (data: {
    predefined: string[]
    custom: string[]
  }) => {
    if (activeHousehold) {
      await updateHouseholdAllergens(activeHousehold.id, data)
      refetchHouseholds()
    } else {
      const updated = await updatePreferences({ personal_allergens: data })
      onPreferencesChange(updated)
    }
  }

  const allergenScopeLabel = activeHousehold
    ? t('settings.householdScope', { name: activeHousehold.name })
    : t('settings.personalScope')

  const currentAllergens: { predefined: string[]; custom: string[] } =
    activeHousehold?.allergens ??
      preferences?.personal_allergens ?? { predefined: [], custom: [] }

  return (
    <>
      <PageHeader title={t('settings.title')} />
      <div className="px-4 py-6 flex flex-col gap-6">
        {/* Profile */}
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-zinc-200 flex items-center justify-center text-lg font-bold uppercase shrink-0">
            {displayName[0] ?? '?'}
          </div>
          <div className="min-w-0">
            {user?.nickname && (
              <p className="font-semibold text-base truncate">
                {user.nickname}
              </p>
            )}
            <p className="text-sm text-zinc-400 truncate">{user?.email}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-2">
          <StatCard
            value={stats?.total_recipes ?? null}
            label={t('settings.recipesLabel')}
          />
          <StatCard
            value={stats?.total_ingredients ?? null}
            label={t('settings.ingredientsLabel')}
          />
          <StatCard
            value={stats?.avg_kcal ?? null}
            label={t('settings.avgKcal')}
          />
        </div>

        {/* Households */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              {t('settings.households')}
            </h2>
            <Button
              size="sm"
              variant="secondary"
              onPress={() => setCreateOpen(true)}
            >
              {t('settings.newHousehold')}
            </Button>
          </div>

          {households.length === 0 ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-400">
              {t('settings.noHouseholds')}
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {households.map((h) => (
                <li
                  key={h.id}
                  className="rounded-xl border border-zinc-200 bg-white p-3 flex items-center gap-3"
                >
                  <span
                    className="w-4 h-4 rounded-full shrink-0"
                    style={{ backgroundColor: h.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{h.name}</p>
                    {h.id === activeHouseholdId && (
                      <p className="text-xs text-primary">
                        {t('settings.active')}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onPress={() => setManagingHousehold(h)}
                  >
                    {t('settings.manage')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Allergies & Intolerances */}
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            {t('settings.allergiesIntolerances')}
          </h2>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 flex flex-col gap-4">
            <AllergenSection
              key={activeHouseholdId ?? 'personal'}
              allergens={currentAllergens}
              scopeLabel={allergenScopeLabel}
              onSave={handleSaveAllergens}
            />
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-100">
              <div>
                <p className="text-sm font-medium">
                  {t('settings.autoApplySubstitutes')}
                </p>
                <p className="text-xs text-zinc-400">
                  {t('settings.autoApplySubstitutesDesc')}
                </p>
              </div>
              <Switch
                size="sm"
                isSelected={preferences?.auto_substitute ?? false}
                onChange={(v) => {
                  updatePreferences({ auto_substitute: v })
                    .then(onPreferencesChange)
                    .catch(() => {})
                }}
              >
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch>
            </div>
          </div>
        </section>

        {/* Account */}
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            {t('settings.account')}
          </h2>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <Button
              size="sm"
              variant="danger-soft"
              onPress={() => setLogoutConfirmOpen(true)}
              isDisabled={loggingOut}
            >
              {loggingOut ? t('settings.loggingOut') : t('settings.logOut')}
            </Button>
          </div>
        </section>

        {/* Preferences */}
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            {t('settings.preferences')}
          </h2>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">
                {t('settings.weekStartsOn')}
              </label>
              <Select
                selectedKey={String(preferences?.week_start_day ?? 1)}
                onSelectionChange={(key) => {
                  updatePreferences({ week_start_day: Number(key) })
                    .then(onPreferencesChange)
                    .catch(() => {})
                }}
                aria-label={t('settings.weekStartsOn')}
              >
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {WEEK_DAY_OPTIONS.map((opt) => (
                      <ListBoxItem key={opt.key} id={String(opt.key)}>
                        {t(opt.labelKey)}
                      </ListBoxItem>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">
                {t('settings.unitSystem')}
              </label>
              <Select
                selectedKey={preferences?.unit_system ?? 'metric'}
                onSelectionChange={(key) => {
                  updatePreferences({ unit_system: String(key) })
                    .then(onPreferencesChange)
                    .catch(() => {})
                }}
                aria-label={t('settings.unitSystem')}
              >
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBoxItem key="metric" id="metric">
                      {t('settings.metric')}
                    </ListBoxItem>
                    <ListBoxItem key="imperial" id="imperial">
                      {t('settings.imperial')}
                    </ListBoxItem>
                  </ListBox>
                </Select.Popover>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">
                {t('settings.language')}
              </label>
              <Select
                selectedKey={preferences?.language ?? i18n.language}
                onSelectionChange={(key) => {
                  const lang = String(key)
                  i18n.changeLanguage(lang)
                  updatePreferences({ language: lang })
                    .then(onPreferencesChange)
                    .catch(() => {})
                }}
                aria-label={t('settings.language')}
              >
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {(['en', 'de', 'pl', 'fr', 'es'] as const).map((code) => (
                      <ListBoxItem key={code} id={code}>
                        {t(`languages.${code}`)}
                      </ListBoxItem>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
            </div>
            {'wakeLock' in navigator && (
              <div className="flex items-center justify-between gap-2 pt-3 border-t border-zinc-100">
                <div>
                  <p className="text-sm font-medium">
                    {t('settings.keepScreenOnDefault')}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {t('settings.keepScreenOnDefaultDesc')}
                  </p>
                </div>
                <Switch
                  size="sm"
                  isSelected={wakeLockDefault}
                  onChange={(v) => {
                    localStorage.setItem('wakelock-default', v ? '1' : '0')
                    setWakeLockDefault(v)
                  }}
                >
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch>
              </div>
            )}
          </div>
        </section>

        <TimerSettingsSection />

        {/* Data */}
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            {t('settings.data')}
          </h2>

          <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-sm font-medium">{t('settings.exportRecipes')}</p>
            <p className="text-xs text-zinc-400">{t('settings.exportDesc')}</p>
            <Button
              size="sm"
              variant="secondary"
              onPress={handleExport}
              isDisabled={exporting}
              className="self-start"
            >
              {exporting ? t('settings.exporting') : t('settings.exportCSV')}
            </Button>
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-sm font-medium">{t('settings.importRecipes')}</p>
            <p className="text-xs text-zinc-400">{t('settings.importDesc')}</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              size="sm"
              variant="secondary"
              onPress={() => fileRef.current?.click()}
              isDisabled={importing}
              className="self-start"
            >
              {importing ? t('settings.importing') : t('settings.chooseCSV')}
            </Button>
            {importResult && (
              <p className="text-xs text-success font-medium">{importResult}</p>
            )}
          </div>
        </section>

        {error && (
          <div className="bg-danger-50 text-danger rounded-lg p-3 text-sm">
            {error}
          </div>
        )}
      </div>

      <CreateHouseholdModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={refetchHouseholds}
      />

      {managingHousehold && (
        <ManageHouseholdModal
          household={managingHousehold}
          isOpen={!!managingHousehold}
          onClose={() => setManagingHousehold(null)}
          onChanged={refetchHouseholds}
        />
      )}

      <Modal
        isOpen={logoutConfirmOpen}
        onOpenChange={(open) => {
          if (!open) setLogoutConfirmOpen(false)
        }}
      >
        <ModalBackdrop isDismissable>
          <ModalContainer size="sm" className="!rounded-xl overflow-hidden">
            <ModalDialog>
              <ModalHeader>{t('settings.logOutConfirmTitle')}</ModalHeader>
              <ModalFooter>
                <Button variant="tertiary" onPress={() => setLogoutConfirmOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button variant="danger" onPress={handleLogout}>
                  {t('settings.logOut')}
                </Button>
              </ModalFooter>
            </ModalDialog>
          </ModalContainer>
        </ModalBackdrop>
      </Modal>
    </>
  )
}

export default SettingsPage
