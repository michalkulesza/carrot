import { useCallback, useEffect, useState } from 'react'
import { Stack } from 'expo-router'
import BellMenu from '../../components/BellMenu'
import BugReportButton from '../../components/BugReportButton'
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAppearanceMode, type AppearanceMode } from '../../context/ColorSchemeContext'
import { useCookingMode } from '../../context/CookingModeContext'
import { usePreferences } from '@carrot/shared/hooks/usePreferences'
import { useHouseholds } from '@carrot/shared/hooks/useHouseholds'
import { useApiClient } from '@carrot/shared/api/context'
import type { UserPreferences, HouseholdOut } from '@carrot/shared/types'
import { useAuth } from '../../context/AuthContext'
import { useScreenLoading } from '../../hooks/useScreenLoading'
import { useHousehold } from '../../context/HouseholdContext'
import { persistLanguage } from '../../i18n'
import HeaderTitle from '../../components/HeaderTitle'
import { SHOW_STEP_QTY_STORAGE_KEY } from '../RecipeDetailScreen/helpers'
import {
  KEEP_AWAKE_SHOPPING_STORAGE_KEY,
  LANGUAGES,
  WEEK_START_OPTIONS,
} from './helpers'
import { styles } from './styles'
import SectionHeader from './SectionHeader'
import StatsSection from './StatsSection'
import PreferencesSection from './PreferencesSection'
import HouseholdsSection from './HouseholdsSection'
import AllergenSection from './AllergenSection'

const SettingsHeaderRight = () => (
  <View style={styles.headerRight}>
    <BugReportButton />
    <BellMenu />
  </View>
)

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
  const { enabled: cookingMode, setEnabled: setCookingMode } = useCookingMode()
  const [showStepQty, setShowStepQty] = useState(true)
  const [keepScreenOnShopping, setKeepScreenOnShopping] = useState(false)

  useEffect(() => {
    AsyncStorage.getItem(SHOW_STEP_QTY_STORAGE_KEY).then((val) => {
      if (val !== null) setShowStepQty(val === '1')
    })
    AsyncStorage.getItem(KEEP_AWAKE_SHOPPING_STORAGE_KEY).then((val) => {
      setKeepScreenOnShopping(val === '1')
    })
  }, [])

  const handleCookingModeToggle = useCallback(
    (val: boolean) => {
      setCookingMode(val)
    },
    [setCookingMode],
  )

  const handleShowStepQtyToggle = useCallback((val: boolean) => {
    setShowStepQty(val)
    void AsyncStorage.setItem(SHOW_STEP_QTY_STORAGE_KEY, val ? '1' : '0')
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

  const handleShareImportsToggle = useCallback(
    (value: boolean) => {
      update.mutate({ share_imports_to_personal: value } as Partial<UserPreferences>)
    },
    [update],
  )

  const { mode: appearanceMode, setMode: setAppearanceMode } = useAppearanceMode()

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

  const handleDeleteAccountEmailSubmit = useCallback(
    (input?: string) => {
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
    [t, deleteAccount, user],
  )

  const handleDeleteAccountPromptEmail = useCallback(() => {
    Alert.prompt(
      t('settings.deleteAccountTypeEmailTitle'),
      t('settings.deleteAccountTypeEmailMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('settings.deleteAccount'), style: 'destructive', onPress: handleDeleteAccountEmailSubmit },
      ],
      'plain-text',
      '',
      'emailAddress',
    )
  }, [t, handleDeleteAccountEmailSubmit])

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(t('settings.deleteAccountConfirmTitle'), t('settings.deleteAccountConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.deleteAccount'), style: 'destructive', onPress: handleDeleteAccountPromptEmail },
    ])
  }, [t, handleDeleteAccountPromptEmail])

  const handleHouseholdNameSubmit = useCallback(
    async (name?: string) => {
      try {
        await createHousehold.mutateAsync({ name: name?.trim() || undefined })
        refetchHouseholds()
      } catch (e) {
        Alert.alert(t('common.ok'), e instanceof Error ? e.message : 'Error')
      }
    },
    [createHousehold, refetchHouseholds, t],
  )

  const handleCreateHousehold = useCallback(() => {
    Alert.prompt(
      t('settings.newHouseholdTitle'),
      t('settings.householdNameOptional'),
      handleHouseholdNameSubmit,
      'plain-text',
      '',
    )
  }, [t, handleHouseholdNameSubmit])

  const handleManageHousehold = useCallback(
    (household: HouseholdOut) => {
      router.push({ pathname: '/household/[id]', params: { id: household.id, householdName: household.name } })
    },
    [router],
  )

  const handleSaveAllergens = useCallback(
    async (data: string[]) => {
      if (activeHousehold) {
        await api.updateHouseholdAllergens(activeHousehold.id, data)
        refetchHouseholds()
      } else {
        await api.updatePreferences({ personal_allergens: data } as Partial<UserPreferences>)
      }
    },
    [activeHousehold, api, refetchHouseholds],
  )

  const handleAppearanceChange = useCallback(
    ({ nativeEvent }: { nativeEvent: { event: string } }) => {
      setAppearanceMode(nativeEvent.event as AppearanceMode)
    },
    [setAppearanceMode],
  )

  const allergenScopeLabel = activeHousehold
    ? t('settings.householdScope', { name: activeHousehold.name })
    : t('settings.personalScope')

  const currentAllergens: string[] =
    activeHousehold?.allergens ?? preferences?.personal_allergens ?? []

  const weekStartLabel = t(
    WEEK_START_OPTIONS.find((o) => o.value === (preferences?.week_start_day ?? 1))?.labelKey ?? 'settings.monday',
  )

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: 48 + insets.bottom }]}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Stack.Screen
        options={{
          headerTitle: () => <HeaderTitle title={t('nav.settings')} />,
          headerRight: () => <SettingsHeaderRight />,
        }}
      />

      <SectionHeader label={t('settings.stats')} />
      <StatsSection />

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

      <SectionHeader label={t('settings.households')} />
      <HouseholdsSection
        households={households}
        activeHouseholdId={activeHouseholdId}
        onManage={handleManageHousehold}
        onCreateHousehold={handleCreateHousehold}
      />

      <SectionHeader label={t('settings.preferences')} />
      <PreferencesSection
        loading={showSpinner}
        error={error}
        preferences={preferences}
        currentLanguageCode={preferences?.language ?? i18n.language}
        appearanceMode={appearanceMode}
        onLanguagePicker={handleLanguagePicker}
        onUnitSystemToggle={handleUnitSystemToggle}
        onAppearanceChange={handleAppearanceChange}
      />

      <SectionHeader label={t('settings.recipeImport')} />
      <View style={styles.card}>
        <View style={styles.switchRow}>
          <View style={styles.switchLabelBlock}>
            <Text style={styles.switchLabel}>{t('settings.shareImportsToPersonal')}</Text>
            <Text style={styles.cardDesc}>{t('settings.shareImportsToPersonalDesc')}</Text>
          </View>
          <Switch
            value={preferences?.share_imports_to_personal ?? false}
            onValueChange={handleShareImportsToggle}
            accessibilityLabel={t('settings.shareImportsToPersonal')}
          />
        </View>
      </View>

      <SectionHeader label={t('settings.recipeDetail')} />
      <View style={styles.card}>
        <View style={[styles.switchRow, styles.switchRowBorder]}>
          <View style={styles.switchLabelBlock}>
            <Text style={styles.switchLabel}>{t('settings.cookingMode')}</Text>
            <Text style={styles.cardDesc}>{t('settings.cookingModeDesc')}</Text>
          </View>
          <Switch
            value={cookingMode}
            onValueChange={handleCookingModeToggle}
            accessibilityLabel={t('settings.cookingMode')}
          />
        </View>
        <View style={styles.switchRow}>
          <View style={styles.switchLabelBlock}>
            <Text style={styles.switchLabel}>{t('settings.showIntelligentIngredients')}</Text>
            <Text style={styles.cardDesc}>{t('settings.showIntelligentIngredientsDesc')}</Text>
          </View>
          <Switch
            value={showStepQty}
            onValueChange={handleShowStepQtyToggle}
            accessibilityLabel={t('settings.showIntelligentIngredients')}
          />
        </View>
      </View>

      <SectionHeader label={t('settings.shoppingList')} />
      <View style={styles.card}>
        <Pressable
          style={({ pressed }) => [styles.pickerRow, pressed && { opacity: 0.7 }]}
          onPress={handleWeekStartPicker}
          accessibilityLabel={t('settings.weekStartsOn')}
          accessibilityRole="button"
        >
          <Text style={styles.pickerLabel}>{t('settings.weekStartsOn')}</Text>
          <View style={styles.pickerRight}>
            <Text style={styles.pickerValue}>{weekStartLabel}</Text>
            <Text style={styles.pickerChevron}>›</Text>
          </View>
        </Pressable>
      </View>
      <View style={styles.card}>
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
    </ScrollView>
  )
}

export default SettingsScreen
