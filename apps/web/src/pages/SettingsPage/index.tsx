import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { ChangeEvent } from 'react'
import type {
  HouseholdOut,
  RecipeStats,
  UserPreferences,
} from '@carrot/shared/types'
import PageHeader from '../../components/PageHeader'
import {
  exportRecipes,
  importRecipes,
  updateHouseholdAllergens,
  updatePreferences,
} from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useHousehold } from '../../context/HouseholdContext'
import { useCookingMode } from '../../context/CookingModeContext'
import ProfileSection from './ProfileSection'
import StatsSection from './StatsSection'
import HouseholdsSection from './HouseholdsSection'
import MyRecipesSection from './MyRecipesSection'
import AllergiesSection from './AllergiesSection'
import AccountSection from './AccountSection'
import PreferencesSection from './PreferencesSection'
import DataSection from './DataSection'
import TimerSettingsSection from './TimerSettingsSection'
import CreateHouseholdModal from './CreateHouseholdModal'
import ManageHouseholdModal from './ManageHouseholdModal'
import LogoutConfirmModal from './LogoutConfirmModal'
import { settingsHashes } from '../../routing/routeState'

interface SettingsPageProps {
  stats: RecipeStats | null
  onStatsRefresh: () => void
  preferences: UserPreferences | null
  onPreferencesChange: (prefs: UserPreferences) => void
}

const SettingsPage = ({
  stats,
  onStatsRefresh,
  preferences,
  onPreferencesChange,
}: SettingsPageProps) => {
  const { user, logout } = useAuth()
  const { households, activeHouseholdId, activeHousehold, refetchHouseholds } =
    useHousehold()
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const { enabled: wakeLockDefault, setEnabled: setWakeLockDefault } =
    useCookingMode()
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

  const handleLogoutConfirm = useCallback(async () => {
    setLogoutConfirmOpen(false)
    setLoggingOut(true)
    await logout()
  }, [logout])

  const handleExport = useCallback(async () => {
    setExporting(true)
    setError(null)
    try {
      await exportRecipes()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings.exportFailed'))
    } finally {
      setExporting(false)
    }
  }, [t])

  const handleChooseFile = useCallback(() => {
    fileRef.current?.click()
  }, [])

  const handleFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
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
        setError(
          err instanceof Error ? err.message : t('settings.importFailed')
        )
      } finally {
        setImporting(false)
        if (fileRef.current) fileRef.current.value = ''
      }
    },
    [t, onStatsRefresh]
  )

  const handleSaveAllergens = useCallback(
    async (data: string[]) => {
      if (activeHousehold) {
        await updateHouseholdAllergens(activeHousehold.id, data)
        refetchHouseholds()
      } else {
        const updated = await updatePreferences({ personal_allergens: data })
        onPreferencesChange(updated)
      }
    },
    [activeHousehold, refetchHouseholds, onPreferencesChange]
  )

  const handleCreateOpen = useCallback(() => setCreateOpen(true), [])
  const handleCreateClose = useCallback(() => setCreateOpen(false), [])
  const handleLogoutClick = useCallback(() => setLogoutConfirmOpen(true), [])
  const handleLogoutConfirmClose = useCallback(
    () => setLogoutConfirmOpen(false),
    []
  )
  const handleManagingHouseholdClose = useCallback(
    () => setManagingHousehold(null),
    []
  )

  const allergenScopeLabel = activeHousehold
    ? t('settings.householdScope', { name: activeHousehold.name })
    : t('settings.myAllergensLabel')

  const currentAllergens =
    activeHousehold?.allergens ?? preferences?.personal_allergens ?? []

  useEffect(() => {
    if (!location.hash) return
    if (!settingsHashes.has(location.hash)) {
      navigate('/settings', { replace: true })

      return
    }
    const target = document.getElementById(location.hash.slice(1))
    if (!target) return
    target.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
      block: 'start',
    })
    target.focus({ preventScroll: true })
  }, [location.hash, navigate])

  return (
    <>
      <PageHeader title={t('settings.title')} />
      <div className="px-4 md:px-6 py-6 flex flex-col gap-6">
        <section id="profile" tabIndex={-1}>
          <ProfileSection
            displayName={displayName}
            nickname={user?.nickname}
            email={user?.email}
          />
        </section>

        <section id="stats" tabIndex={-1}>
          <StatsSection stats={stats} />
        </section>

        <section id="households" tabIndex={-1}>
          <HouseholdsSection
            households={households}
            activeHouseholdId={activeHouseholdId}
            onCreateNew={handleCreateOpen}
            onManage={setManagingHousehold}
          />
        </section>

        <section id="my-recipes" tabIndex={-1}>
          <MyRecipesSection
            households={households}
            activeHouseholdId={activeHouseholdId}
          />
        </section>

        <section id="allergies" tabIndex={-1}>
          <AllergiesSection
            remountKey={activeHouseholdId ?? 'personal'}
            allergens={currentAllergens}
            scopeLabel={allergenScopeLabel}
            onSaveAllergens={handleSaveAllergens}
            autoSubstitute={preferences?.auto_substitute ?? false}
            onPreferencesChange={onPreferencesChange}
          />
        </section>

        <section id="account" tabIndex={-1}>
          <AccountSection
            loggingOut={loggingOut}
            onLogoutClick={handleLogoutClick}
          />
        </section>

        <section id="preferences" tabIndex={-1}>
          <PreferencesSection
            preferences={preferences}
            onPreferencesChange={onPreferencesChange}
            wakeLockDefault={wakeLockDefault}
            onWakeLockDefaultChange={setWakeLockDefault}
          />
        </section>

        <section id="timers" tabIndex={-1}>
          <TimerSettingsSection />
        </section>

        <section id="data" tabIndex={-1}>
          <DataSection
            exporting={exporting}
            importing={importing}
            importResult={importResult}
            fileRef={fileRef}
            onExport={handleExport}
            onChooseFile={handleChooseFile}
            onFileChange={handleFileChange}
          />
        </section>

        {error && (
          <div className="bg-danger-50 text-danger rounded-lg p-3 text-sm">
            {error}
          </div>
        )}
      </div>

      <CreateHouseholdModal
        isOpen={createOpen}
        onClose={handleCreateClose}
        onCreated={refetchHouseholds}
      />

      {managingHousehold && (
        <ManageHouseholdModal
          household={managingHousehold}
          isOpen={!!managingHousehold}
          onClose={handleManagingHouseholdClose}
          onChanged={refetchHouseholds}
        />
      )}

      <LogoutConfirmModal
        isOpen={logoutConfirmOpen}
        onClose={handleLogoutConfirmClose}
        onConfirm={handleLogoutConfirm}
      />
    </>
  )
}

export default SettingsPage
