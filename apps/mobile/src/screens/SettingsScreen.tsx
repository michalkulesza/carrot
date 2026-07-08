import { useCallback, useEffect, useState } from 'react'
import { Stack } from 'expo-router'
import BellMenu from '../components/BellMenu'
import BugReportButton from '../components/BugReportButton'
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MenuView } from '@react-native-menu/menu'
import { useAppearanceMode, type AppearanceMode } from '../context/ColorSchemeContext'
import { useDebugMode } from '../context/DebugModeContext'
import { usePreferences } from '@carrot/shared/hooks/usePreferences'
import { useHouseholds } from '@carrot/shared/hooks/useHouseholds'
import { useApiClient } from '@carrot/shared/api/context'
import { useRecipeStats } from '@carrot/shared/hooks/useRecipes'
import type { UserPreferences, AllergenData } from '@carrot/shared/types'
import { useAuth } from '../context/AuthContext'
import { useScreenLoading } from '../hooks/useScreenLoading'
import { useHousehold } from '../context/HouseholdContext'
import { useTimers } from '../context/TimerContext'
import { persistLanguage } from '../i18n'
import { colors } from '../theme/colors'
import HeaderTitle from '../components/HeaderTitle'

const CARD_RADIUS = Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 26 ? 20 : 10

const LANGUAGES: { code: string; labelKey: string }[] = [
  { code: 'en', labelKey: 'languages.en' },
  { code: 'de', labelKey: 'languages.de' },
  { code: 'pl', labelKey: 'languages.pl' },
  { code: 'fr', labelKey: 'languages.fr' },
  { code: 'es', labelKey: 'languages.es' },
]

const WEEK_START_OPTIONS: { value: number; labelKey: string }[] = [
  { value: 0, labelKey: 'settings.sunday' },
  { value: 1, labelKey: 'settings.monday' },
  { value: 6, labelKey: 'settings.saturday' },
]

const APPEARANCE_OPTIONS: { value: AppearanceMode; labelKey: string }[] = [
  { value: 'system', labelKey: 'settings.appearanceSystem' },
  { value: 'light', labelKey: 'settings.appearanceLight' },
  { value: 'dark', labelKey: 'settings.appearanceDark' },
]

const DEVELOPER_SETTINGS_EMAIL = 'kulesza.michal@gmail.com'

const ALLERGEN_KEYS = [
  'gluten', 'crustaceans', 'tree nuts', 'celery', 'mustard',
  'sulphites', 'lupin', 'molluscs', 'eggs', 'fish',
  'peanuts', 'soybeans', 'milk', 'sesame',
]

const INTOLERANCE_KEYS = [
  'lactose', 'ncgs', 'fructose', 'histamine', 'fodmap',
  'caffeine', 'sulphite-sensitivity', 'sorbitol', 'salicylates', 'msg',
]

const iKey = (k: string) => k.replace(/[- ]/g, '_')

const SectionHeader = ({ label }: { label: string }) => (
  <Text style={styles.sectionHeader}>{label}</Text>
)

// ── Stats section ─────────────────────────────────────────────────────────────

const StatsSection = () => {
  const { t } = useTranslation()
  const { data: stats, isLoading } = useRecipeStats()
  const { showSpinner } = useScreenLoading(isLoading)

  return (
    <View style={styles.statsRow}>
      {showSpinner ? (
        <ActivityIndicator accessibilityLabel={t('common.loading')} />
      ) : (
        <>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats?.total_recipes ?? '—'}</Text>
            <Text style={styles.statLabel}>{t('settings.recipesLabel')}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats?.total_ingredients ?? '—'}</Text>
            <Text style={styles.statLabel}>{t('settings.ingredientsLabel')}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {stats?.avg_kcal != null ? Math.round(stats.avg_kcal) : '—'}
            </Text>
            <Text style={styles.statLabel}>{t('settings.avgKcal')}</Text>
          </View>
        </>
      )}
    </View>
  )
}

// ── Allergen section ──────────────────────────────────────────────────────────

const AllergenSection = ({
  allergens,
  scopeLabel,
  onSave,
  onReanalyze,
}: {
  allergens: AllergenData
  scopeLabel: string
  onSave: (data: AllergenData) => Promise<void>
  onReanalyze: (callbacks: {
    onStart: (total: number) => void
    onProgress: (done: number, total: number) => void
    onComplete: (analyzed: number) => void
    onError: (msg: string) => void
  }) => void
}) => {
  const { t } = useTranslation()
  const [predefined, setPredefined] = useState<string[]>(allergens.predefined ?? [])
  const [custom, setCustom] = useState<string[]>(allergens.custom ?? [])
  const [tagInput, setTagInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [reanalyzing, setReanalyzing] = useState(false)
  const [reanalyzeProgress, setReanalyzeProgress] = useState<{ done: number; total: number } | null>(null)
  const [expanded, setExpanded] = useState<'allergens' | 'intolerances' | 'custom' | null>(null)

  const togglePredefined = (key: string) => {
    setPredefined((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
  }

  const addCustom = () => {
    const tag = tagInput.trim().toLowerCase()
    if (tag && !custom.includes(tag)) setCustom((prev) => [...prev, tag])
    setTagInput('')
  }

  const removeCustom = (tag: string) => {
    setCustom((prev) => prev.filter((t) => t !== tag))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({ predefined, custom })
      Alert.alert(t('common.ok'), t('settings.allergensSaved'))
    } catch (e) {
      Alert.alert(t('common.ok'), e instanceof Error ? e.message : t('settings.failedToSave'))
    } finally {
      setSaving(false)
    }
  }

  const handleReanalyze = () => {
    setReanalyzing(true)
    setReanalyzeProgress({ done: 0, total: 0 })
    onReanalyze({
      onStart: (total) => setReanalyzeProgress({ done: 0, total }),
      onProgress: (done, total) => setReanalyzeProgress({ done, total }),
      onComplete: (analyzed) => {
        setReanalyzing(false)
        setReanalyzeProgress(null)
        Alert.alert(t('common.ok'), t('settings.reanalyzedRecipes', { count: analyzed }))
      },
      onError: (msg) => {
        setReanalyzing(false)
        setReanalyzeProgress(null)
        Alert.alert(t('common.ok'), msg)
      },
    })
  }

  const renderGroup = (
    keys: string[],
    namespace: 'allergens' | 'intolerances',
    sectionKey: 'allergens' | 'intolerances',
    label: string,
  ) => (
    <View style={styles.accordionBlock}>
      <Pressable
        style={({ pressed }) => [styles.accordionHeader, pressed && { opacity: 0.7 }]}
        onPress={() =>
          setExpanded((prev) => (prev === sectionKey ? null : sectionKey))
        }
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ expanded: expanded === sectionKey }}
      >
        <Text style={styles.accordionLabel}>{label}</Text>
        <Text style={styles.accordionChevron}>
          {expanded === sectionKey ? '▲' : '▼'}
        </Text>
      </Pressable>
      {expanded === sectionKey && (
        <View style={styles.accordionBody}>
          {keys.map((key) => {
            const k = iKey(key)
            const desc = t(`${namespace}.${k}_desc`, { defaultValue: '' })
            const isSelected = predefined.includes(key)
            return (
              <Pressable
                key={key}
                style={({ pressed }) => [styles.checkRow, pressed && { opacity: 0.7 }]}
                onPress={() => togglePredefined(key)}
                accessibilityLabel={t(`${namespace}.${k}`)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected }}
              >
                <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                  {isSelected && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <View style={styles.checkContent}>
                  <Text style={styles.checkLabel}>{t(`${namespace}.${k}`)}</Text>
                  {desc ? (
                    <Text style={styles.checkDesc}>{desc}</Text>
                  ) : null}
                </View>
              </Pressable>
            )
          })}
        </View>
      )}
    </View>
  )

  return (
    <View>
      <Text style={styles.scopeLabel}>{scopeLabel}</Text>
      <Text style={styles.allergenDisclaimer}>{t('settings.allergenDisclaimer')}</Text>

      {renderGroup(ALLERGEN_KEYS, 'allergens', 'allergens', t('settings.allergens'))}
      {renderGroup(INTOLERANCE_KEYS, 'intolerances', 'intolerances', t('settings.intolerances'))}

      {/* Custom */}
      <View style={styles.accordionBlock}>
        <Pressable
          style={({ pressed }) => [styles.accordionHeader, pressed && { opacity: 0.7 }]}
          onPress={() =>
            setExpanded((prev) => (prev === 'custom' ? null : 'custom'))
          }
          accessibilityLabel={t('settings.custom')}
          accessibilityRole="button"
          accessibilityState={{ expanded: expanded === 'custom' }}
        >
          <Text style={styles.accordionLabel}>{t('settings.custom')}</Text>
          <Text style={styles.accordionChevron}>
            {expanded === 'custom' ? '▲' : '▼'}
          </Text>
        </Pressable>
        {expanded === 'custom' && (
          <View style={styles.accordionBody}>
            <View style={styles.customInputRow}>
              <TextInput
                style={styles.customInput}
                value={tagInput}
                onChangeText={setTagInput}
                placeholder={t('settings.customPlaceholder')}
                onSubmitEditing={addCustom}
                returnKeyType="done"
                accessibilityLabel={t('settings.custom')}
              />
              <Pressable
                style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}
                onPress={addCustom}
                accessibilityLabel={t('common.add')}
                accessibilityRole="button"
              >
                <Text style={styles.addBtnText}>{t('common.add')}</Text>
              </Pressable>
            </View>
            {custom.length > 0 && (
              <View style={styles.tagCloud}>
                {custom.map((tag) => (
                  <View key={tag} style={styles.customTag}>
                    <Text style={styles.customTagText}>{tag}</Text>
                    <Pressable
                      onPress={() => removeCustom(tag)}
                      accessibilityLabel={t('common.delete')}
                      accessibilityRole="button"
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      style={({ pressed }) => pressed && { opacity: 0.7 }}
                    >
                      <Text style={styles.customTagRemove}>×</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </View>

      <Pressable
        style={({ pressed }) => [styles.saveBtn, saving && styles.saveBtnDisabled, pressed && { opacity: 0.7 }]}
        onPress={handleSave}
        disabled={saving}
        accessibilityLabel={t('common.save')}
        accessibilityRole="button"
      >
        <Text style={styles.saveBtnText}>
          {saving ? t('common.saving') : t('common.save')}
        </Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.reanalyzeBtn, reanalyzing && styles.saveBtnDisabled, pressed && { opacity: 0.7 }]}
        onPress={handleReanalyze}
        disabled={reanalyzing}
        accessibilityLabel={t('settings.reAnalyzeRecipes')}
        accessibilityRole="button"
      >
        <Text style={styles.reanalyzeBtnText}>
          {reanalyzing
            ? reanalyzeProgress && reanalyzeProgress.total > 0
              ? t('settings.analyzingProgress', {
                  done: reanalyzeProgress.done,
                  total: reanalyzeProgress.total,
                })
              : t('settings.starting')
            : t('settings.reAnalyzeRecipes')}
        </Text>
      </Pressable>
    </View>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────

const KEEP_AWAKE_STORAGE_KEY = 'recipe-keep-screen-default'
const KEEP_AWAKE_SHOPPING_STORAGE_KEY = 'shopping-list-keep-screen-on'

const SettingsScreen = () => {
  const router = useRouter()
  const { t, i18n } = useTranslation()
  const { user, logout, deleteAccount } = useAuth()
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  const { preferences, isLoading, error, update } = usePreferences()
  const { showSpinner } = useScreenLoading(isLoading)
  const { households, activeHouseholdId, activeHousehold, refetchHouseholds } = useHousehold()
  const { create: createHousehold } = useHouseholds()
  const api = useApiClient()
  const insets = useSafeAreaInsets()
  const { keepScreenOn: keepScreenOnTimer, setKeepScreenOn: setKeepScreenOnTimer } = useTimers()
  const [keepScreenDefault, setKeepScreenDefault] = useState(false)
  const [keepScreenOnShopping, setKeepScreenOnShopping] = useState(false)

  useEffect(() => {
    AsyncStorage.getItem(KEEP_AWAKE_STORAGE_KEY).then((val) => {
      setKeepScreenDefault(val === '1')
    })
    AsyncStorage.getItem(KEEP_AWAKE_SHOPPING_STORAGE_KEY).then((val) => {
      setKeepScreenOnShopping(val === '1')
    })
  }, [])

  const handleKeepScreenDefaultToggle = useCallback((val: boolean) => {
    setKeepScreenDefault(val)
    void AsyncStorage.setItem(KEEP_AWAKE_STORAGE_KEY, val ? '1' : '0')
  }, [])

  const handleKeepScreenShoppingToggle = useCallback((val: boolean) => {
    setKeepScreenOnShopping(val)
    void AsyncStorage.setItem(KEEP_AWAKE_SHOPPING_STORAGE_KEY, val ? '1' : '0')
  }, [])

  const handleLanguageChange = useCallback(
    (code: string) => {
      void i18n.changeLanguage(code)
      void persistLanguage(code)
      update.mutate({ language: code } as Partial<UserPreferences>)
    },
    [i18n, update],
  )

  const handleUnitSystemToggle = useCallback(
    (isMetric: boolean) => {
      update.mutate({ unit_system: isMetric ? 'metric' : 'imperial' } as Partial<UserPreferences>)
    },
    [update],
  )

  const handleWeekStartChange = useCallback(
    (value: number) => {
      update.mutate({ week_start_day: value } as Partial<UserPreferences>)
    },
    [update],
  )

  const { mode: appearanceMode, setMode: setAppearanceMode } = useAppearanceMode()
  const { enabled: debugMode, setEnabled: setDebugMode } = useDebugMode()

  const handleLanguagePicker = useCallback(() => {
    const labels = LANGUAGES.map(({ labelKey }) => t(labelKey))
    ActionSheetIOS.showActionSheetWithOptions(
      { options: [...labels, t('common.cancel')], cancelButtonIndex: labels.length },
      (index) => {
        if (index < LANGUAGES.length) handleLanguageChange(LANGUAGES[index].code)
      },
    )
  }, [t, handleLanguageChange])

  const handleWeekStartPicker = useCallback(() => {
    const labels = WEEK_START_OPTIONS.map(({ labelKey }) => t(labelKey))
    ActionSheetIOS.showActionSheetWithOptions(
      { options: [...labels, t('common.cancel')], cancelButtonIndex: labels.length },
      (index) => {
        if (index < WEEK_START_OPTIONS.length) handleWeekStartChange(WEEK_START_OPTIONS[index].value)
      },
    )
  }, [t, handleWeekStartChange])

  const handleLogout = useCallback(() => {
    Alert.alert(t('settings.logOutConfirmTitle'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.logOut'), style: 'destructive', onPress: () => void logout() },
    ])
  }, [t, logout])

  const handleOpenPrivacyPolicy = useCallback(() => {
    void Linking.openURL('https://carrot.xcxz.xyz/privacy-policy')
  }, [])

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(t('settings.deleteAccountConfirmTitle'), t('settings.deleteAccountConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.deleteAccount'),
        style: 'destructive',
        onPress: () => {
          Alert.prompt(
            t('settings.deleteAccountTypeEmailTitle'),
            t('settings.deleteAccountTypeEmailMessage', { email: user?.email ?? '' }),
            [
              { text: t('common.cancel'), style: 'cancel' },
              {
                text: t('settings.deleteAccount'),
                style: 'destructive',
                onPress: (input) => {
                  if (!input || input.trim().toLowerCase() !== user?.email?.toLowerCase()) {
                    Alert.alert(t('common.ok'), t('settings.deleteAccountEmailMismatch'))
                    return
                  }
                  setIsDeletingAccount(true)
                  deleteAccount()
                    .catch((e) => {
                      Alert.alert(t('common.ok'), e instanceof Error ? e.message : 'Error')
                    })
                    .finally(() => setIsDeletingAccount(false))
                },
              },
            ],
            'plain-text',
            '',
            'emailAddress',
          )
        },
      },
    ])
  }, [t, deleteAccount, user])

  const handleCreateHousehold = useCallback(() => {
    Alert.prompt(
      t('settings.newHouseholdTitle'),
      t('settings.householdNameOptional'),
      async (name) => {
        try {
          await createHousehold.mutateAsync({ name: name?.trim() || undefined })
          refetchHouseholds()
        } catch (e) {
          Alert.alert(t('common.ok'), e instanceof Error ? e.message : 'Error')
        }
      },
      'plain-text',
      '',
    )
  }, [createHousehold, refetchHouseholds, t])

  const handleSaveAllergens = useCallback(
    async (data: AllergenData) => {
      if (activeHousehold) {
        await api.updateHouseholdAllergens(activeHousehold.id, data)
        refetchHouseholds()
      } else {
        await api.updatePreferences({ personal_allergens: data } as Partial<UserPreferences>)
      }
    },
    [activeHousehold, api, refetchHouseholds],
  )

  const allergenScopeLabel = activeHousehold
    ? t('settings.householdScope', { name: activeHousehold.name })
    : t('settings.personalScope')

  const currentAllergens: AllergenData =
    (activeHousehold?.allergens ?? (preferences as any)?.personal_allergens) ?? {
      predefined: [],
      custom: [],
    }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: 48 + insets.bottom }]}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Stack.Screen
        options={{
          headerTitle: () => <HeaderTitle title={t('nav.settings')} />,
          headerRight: () => (
            <View style={styles.headerRight}>
              <BugReportButton />
              <BellMenu />
            </View>
          ),
        }}
      />
      {/* Stats */}
      <SectionHeader label={t('settings.stats')} />
      <StatsSection />

      {/* Account */}
      <SectionHeader label={t('settings.account')} />
      <View style={styles.card}>
        {user && (
          <View style={styles.row}>
            <Text style={styles.label}>{t('auth.email')}</Text>
            <Text style={styles.value} numberOfLines={1}>
              {user.email}
            </Text>
          </View>
        )}
        <Pressable
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
          onPress={handleOpenPrivacyPolicy}
          accessibilityLabel={t('settings.privacyPolicy')}
          accessibilityRole="link"
        >
          <Text style={styles.privacyPolicyText}>{t('settings.privacyPolicy')}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.logoutRow, styles.logoutRowDivider, pressed && { opacity: 0.7 }]}
          onPress={handleLogout}
          accessibilityLabel={t('settings.logOut')}
          accessibilityRole="button"
        >
          <Text style={styles.logoutText}>{t('settings.logOut')}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.logoutRow, pressed && { opacity: 0.7 }]}
          onPress={handleDeleteAccount}
          disabled={isDeletingAccount}
          accessibilityLabel={t('settings.deleteAccount')}
          accessibilityRole="button"
        >
          {isDeletingAccount ? (
            <ActivityIndicator />
          ) : (
            <Text style={styles.logoutText}>{t('settings.deleteAccount')}</Text>
          )}
        </Pressable>
      </View>

      {/* Preferences */}
      <SectionHeader label={t('settings.preferences')} />
      {showSpinner ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator accessibilityLabel={t('common.loading')} />
        </View>
      ) : error ? (
        <View style={styles.card}>
          <Text style={styles.errorText}>{error.message}</Text>
        </View>
      ) : (
        <>
          {/* Language */}
          <View style={styles.card}>
            <Pressable
              style={({ pressed }) => [styles.pickerRow, pressed && { opacity: 0.7 }]}
              onPress={handleLanguagePicker}
              accessibilityLabel={t('settings.language')}
              accessibilityRole="button"
            >
              <Text style={styles.pickerLabel}>{t('settings.language')}</Text>
              <View style={styles.pickerRight}>
                <Text style={styles.pickerValue}>
                  {t(LANGUAGES.find(l => l.code === (preferences?.language ?? i18n.language))?.labelKey ?? 'languages.en')}
                </Text>
                <Text style={styles.pickerChevron}>›</Text>
              </View>
            </Pressable>
          </View>

          {/* Week start day */}
          <View style={styles.card}>
            <Pressable
              style={({ pressed }) => [styles.pickerRow, pressed && { opacity: 0.7 }]}
              onPress={handleWeekStartPicker}
              accessibilityLabel={t('settings.weekStartsOn')}
              accessibilityRole="button"
            >
              <Text style={styles.pickerLabel}>{t('settings.weekStartsOn')}</Text>
              <View style={styles.pickerRight}>
                <Text style={styles.pickerValue}>
                  {t(WEEK_START_OPTIONS.find(o => o.value === (preferences?.week_start_day ?? 1))?.labelKey ?? 'settings.monday')}
                </Text>
                <Text style={styles.pickerChevron}>›</Text>
              </View>
            </Pressable>
          </View>

          {/* Unit system */}
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View style={styles.switchLabelBlock}>
                <Text style={styles.switchLabel}>{t('settings.useMetricSystem')}</Text>
                <Text style={styles.cardDesc}>{t('settings.useMetricSystemDesc')}</Text>
              </View>
              <Switch
                value={preferences?.unit_system !== 'imperial'}
                onValueChange={handleUnitSystemToggle}
                accessibilityLabel={t('settings.useMetricSystem')}
              />
            </View>
          </View>
        </>
      )}

      {/* Screen */}
      <SectionHeader label={t('settings.screen')} />
      <View style={styles.card}>
        <View style={[styles.switchRow, styles.switchRowBorder]}>
          <View style={styles.switchLabelBlock}>
            <Text style={styles.switchLabel}>{t('settings.keepScreenOnDefault')}</Text>
            <Text style={styles.cardDesc}>{t('settings.keepScreenOnDefaultDesc')}</Text>
          </View>
          <Switch
            value={keepScreenDefault}
            onValueChange={handleKeepScreenDefaultToggle}
            accessibilityLabel={t('settings.keepScreenOnDefault')}
          />
        </View>
        <View style={[styles.switchRow, styles.switchRowBorder]}>
          <View style={styles.switchLabelBlock}>
            <Text style={styles.switchLabel}>{t('timers.keepScreenOn')}</Text>
            <Text style={styles.cardDesc}>{t('timers.keepScreenOnDesc')}</Text>
          </View>
          <Switch
            value={keepScreenOnTimer}
            onValueChange={setKeepScreenOnTimer}
            accessibilityLabel={t('timers.keepScreenOn')}
          />
        </View>
        <View style={styles.switchRow}>
          <View style={styles.switchLabelBlock}>
            <Text style={styles.switchLabel}>{t('settings.keepScreenOnWhileShoppingList')}</Text>
            <Text style={styles.cardDesc}>{t('settings.keepScreenOnWhileShoppingListDesc')}</Text>
          </View>
          <Switch
            value={keepScreenOnShopping}
            onValueChange={handleKeepScreenShoppingToggle}
            accessibilityLabel={t('settings.keepScreenOnWhileShoppingList')}
          />
        </View>
      </View>

      {/* Households */}
      <SectionHeader label={t('settings.households')} />
      <View style={styles.card}>
        {households.length === 0 ? (
          <Text style={styles.emptyHouseholds}>{t('settings.noHouseholds')}</Text>
        ) : (
          households.map((h, index) => (
            <View
              key={h.id}
              style={[
                styles.householdRow,
                index < households.length - 1 && styles.householdRowBorder,
              ]}
            >
              <View
                style={[styles.householdDot, { backgroundColor: h.color }]}
              />
              <View style={styles.householdInfo}>
                <Text style={styles.householdName}>{h.name}</Text>
                {h.id === activeHouseholdId && (
                  <Text style={styles.householdActive}>{t('settings.active')}</Text>
                )}
              </View>
              <Pressable
                style={({ pressed }) => [styles.manageBtn, pressed && { opacity: 0.7 }]}
                onPress={() =>
                  router.push({ pathname: '/household/[id]', params: { id: h.id, householdName: h.name } })
                }
                accessibilityLabel={t('settings.manage')}
                accessibilityRole="button"
              >
                <Text style={styles.manageBtnText}>{t('settings.manage')}</Text>
              </Pressable>
            </View>
          ))
        )}
        <Pressable
          style={({ pressed }) => [styles.newHouseholdRow, pressed && { opacity: 0.7 }]}
          onPress={handleCreateHousehold}
          accessibilityLabel={t('settings.newHousehold')}
          accessibilityRole="button"
        >
          <Text style={styles.newHouseholdText}>{t('settings.newHousehold')}</Text>
        </Pressable>
      </View>

      {/* Allergens */}
      <SectionHeader label={t('settings.allergiesIntolerances')} />
      <View style={styles.card}>
        <View style={styles.allergenPad}>
          <AllergenSection
            key={activeHouseholdId ?? 'personal'}
            allergens={currentAllergens}
            scopeLabel={allergenScopeLabel}
            onSave={handleSaveAllergens}
            onReanalyze={api.streamReanalyze}
          />
        </View>
      </View>

      {/* Developer */}
      {user?.email === DEVELOPER_SETTINGS_EMAIL && (
        <>
          <SectionHeader label={t('settings.developer')} />
          <View style={styles.card}>
            <MenuView
              title={t('settings.appearance')}
              onPressAction={({ nativeEvent }) => {
                setAppearanceMode(nativeEvent.event as AppearanceMode)
              }}
              actions={APPEARANCE_OPTIONS.map(({ value, labelKey }) => ({
                id: value,
                title: t(labelKey),
                state: appearanceMode === value ? 'on' : 'off',
              }))}
            >
              <View style={[styles.pickerRow, styles.switchRowBorder]}>
                <Text style={styles.pickerLabel}>{t('settings.appearance')}</Text>
                <View style={styles.pickerRight}>
                  <Text style={styles.pickerValue}>
                    {t(APPEARANCE_OPTIONS.find(o => o.value === appearanceMode)?.labelKey ?? 'settings.appearanceSystem')}
                  </Text>
                  <Text style={styles.pickerChevron}>›</Text>
                </View>
              </View>
            </MenuView>
            <View style={styles.switchRow}>
              <View style={styles.switchLabelBlock}>
                <Text style={styles.switchLabel}>{t('settings.debugMode')}</Text>
                <Text style={styles.cardDesc}>{t('settings.debugModeDesc')}</Text>
              </View>
              <Switch
                value={debugMode}
                onValueChange={setDebugMode}
                accessibilityLabel={t('settings.debugMode')}
              />
            </View>
          </View>
        </>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.secondaryBackground },
  content: { paddingBottom: 48 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: 16,
    marginBottom: 4,
    gap: 8,
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statCard: {
    flexBasis: '30%',
    flexGrow: 1,
    backgroundColor: colors.background,
    borderRadius: CARD_RADIUS,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.label,
  },
  statLabel: {
    fontSize: 11,
    color: colors.tertiaryLabel,
    marginTop: 3,
    textAlign: 'center',
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.secondaryLabel,
    marginLeft: 32,
    marginRight: 16,
    marginTop: 24,
    marginBottom: 8,
  },
  card: {
    backgroundColor: colors.background,
    borderRadius: CARD_RADIUS,
    marginHorizontal: 16,
    marginBottom: 4,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  label: { fontSize: 16, color: colors.secondaryLabel },
  value: { fontSize: 16, color: colors.secondaryLabel, maxWidth: '60%' },
  logoutRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'flex-start',
  },
  logoutRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  logoutText: { color: colors.red, fontSize: 16, fontWeight: '500' },
  privacyPolicyText: { color: colors.blue, fontSize: 16 },
  loadingRow: { padding: 24, alignItems: 'center' },
  errorText: { color: colors.red, fontSize: 16, padding: 16 },
  cardLabel: {
    fontSize: 16,
    color: colors.secondaryLabel,
    fontWeight: '500',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  switchLabel: {
    fontSize: 16,
    color: colors.label,
  },
  cardDesc: {
    fontSize: 12,
    color: colors.tertiaryLabel,
    marginTop: 2,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  pickerLabel: { fontSize: 16, color: colors.label },
  pickerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pickerValue: { fontSize: 16, color: colors.secondaryLabel },
  pickerChevron: { fontSize: 20, color: colors.tertiaryLabel, lineHeight: 22 },
  switchRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  switchRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  switchLabelBlock: { flex: 1, marginRight: 12 },
  // Household section
  householdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  householdRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  householdDot: { width: 14, height: 14, borderRadius: 7 },
  householdInfo: { flex: 1 },
  householdName: { fontSize: 16, fontWeight: '500', color: colors.label },
  householdActive: { fontSize: 12, color: colors.blue, marginTop: 1 },
  manageBtn: {
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  manageBtnText: { fontSize: 16, fontWeight: '400', color: colors.blue },
  newHouseholdRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  newHouseholdText: { fontSize: 16, color: colors.blue, fontWeight: '500' },
  emptyHouseholds: {
    fontSize: 16,
    color: colors.tertiaryLabel,
    padding: 16,
    textAlign: 'center',
  },
  // Allergen section
  allergenPad: { padding: 16 },
  scopeLabel: { fontSize: 12, color: colors.tertiaryLabel, marginBottom: 4 },
  allergenDisclaimer: { fontSize: 13, lineHeight: 18, color: colors.tertiaryLabel, marginBottom: 12 },
  accordionBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
    marginTop: 4,
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  accordionLabel: { fontSize: 16, fontWeight: '500', color: colors.secondaryLabel },
  accordionChevron: { fontSize: 10, color: colors.tertiaryLabel },
  accordionBody: { paddingBottom: 12 },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    gap: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.opaqueSeparator,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxSelected: { backgroundColor: colors.blue, borderColor: colors.blue },
  checkmark: { color: colors.background, fontSize: 12, fontWeight: '700' },
  checkContent: { flex: 1 },
  checkLabel: { fontSize: 16, color: colors.label },
  checkDesc: { fontSize: 12, color: colors.tertiaryLabel, marginTop: 1 },
  customInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  customInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.opaqueSeparator,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    color: colors.label,
  },
  addBtn: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.secondaryBackground,
    borderWidth: 1,
    borderColor: colors.opaqueSeparator,
  },
  addBtnText: { fontSize: 13, fontWeight: '600', color: colors.secondaryLabel },
  tagCloud: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  customTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.secondaryBackground,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 4,
  },
  customTagText: { fontSize: 13, color: colors.secondaryLabel },
  customTagRemove: { fontSize: 16, color: colors.tertiaryLabel, lineHeight: 18 },
  saveBtn: {
    backgroundColor: colors.blue,
    borderRadius: CARD_RADIUS,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 16,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: colors.background, fontSize: 16, fontWeight: '600' },
  reanalyzeBtn: {
    backgroundColor: colors.secondaryBackground,
    borderRadius: CARD_RADIUS,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.opaqueSeparator,
  },
  reanalyzeBtnText: { color: colors.secondaryLabel, fontSize: 16, fontWeight: '600' },
})

export default SettingsScreen
