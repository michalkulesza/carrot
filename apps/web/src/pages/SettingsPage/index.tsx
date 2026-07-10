import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ChangeEvent } from 'react'
import type {
  AllergenData,
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
import { useDebugMode } from '../../context/DebugModeContext'
import ProfileSection from './ProfileSection'
import StatsSection from './StatsSection'
import HouseholdsSection from './HouseholdsSection'
import AllergiesSection from './AllergiesSection'
import AccountSection from './AccountSection'
import PreferencesSection from './PreferencesSection'
import DataSection from './DataSection'
import TimerSettingsSection from './TimerSettingsSection'
import CreateHouseholdModal from './CreateHouseholdModal'
import ManageHouseholdModal from './ManageHouseholdModal'
import LogoutConfirmModal from './LogoutConfirmModal'
import { emptyAllergenData } from './helpers'

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
  const { enabled: debugMode, setEnabled: setDebugMode } = useDebugMode()
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
    async (data: AllergenData) => {
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
    : t('settings.personalScope')

  const currentAllergens =
    activeHousehold?.allergens ??
    preferences?.personal_allergens ??
    emptyAllergenData

  return (
    <>
      <PageHeader title={t('settings.title')} />
      <div className="px-4 py-6 flex flex-col gap-6">
        <ProfileSection
          displayName={displayName}
          nickname={user?.nickname}
          email={user?.email}
        />

        <StatsSection stats={stats} />

        <HouseholdsSection
          households={households}
          activeHouseholdId={activeHouseholdId}
          onCreateNew={handleCreateOpen}
          onManage={setManagingHousehold}
        />

        <AllergiesSection
          remountKey={activeHouseholdId ?? 'personal'}
          allergens={currentAllergens}
          scopeLabel={allergenScopeLabel}
          onSaveAllergens={handleSaveAllergens}
          autoSubstitute={preferences?.auto_substitute ?? false}
          onPreferencesChange={onPreferencesChange}
        />

        <AccountSection
          loggingOut={loggingOut}
          onLogoutClick={handleLogoutClick}
        />

        <PreferencesSection
          preferences={preferences}
          onPreferencesChange={onPreferencesChange}
          wakeLockDefault={wakeLockDefault}
          onWakeLockDefaultChange={setWakeLockDefault}
          debugMode={debugMode}
          onDebugModeChange={setDebugMode}
        />

        <TimerSettingsSection />

        <DataSection
          exporting={exporting}
          importing={importing}
          importResult={importResult}
          fileRef={fileRef}
          onExport={handleExport}
          onChooseFile={handleChooseFile}
          onFileChange={handleFileChange}
        />

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
