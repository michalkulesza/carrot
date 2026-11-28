import { useCallback, useMemo, type ReactNode } from 'react'
import { ActivityIndicator, Alert, useWindowDimensions, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { usePreferences } from '@carrot/shared/hooks/usePreferences'
import type { UserPreferences } from '@carrot/shared/types'
import { AppText, Button, SectionHeader, SegmentedControl, SettingsGroup, SettingsRow } from '../../components/ui'
import { useAppearanceMode } from '../../context/ColorSchemeContext'
import { useActionMenu } from '../../context/DialogContext'
import { useScreenLoading } from '../../hooks/useScreenLoading'
import { persistLanguage } from '../../i18n'
import { APPEARANCE_OPTIONS, LANGUAGES, UNIT_OPTIONS, WEEK_START_OPTIONS } from './helpers'
import { styles } from './styles'

type UnitSystem = (typeof UNIT_OPTIONS)[number]['value']

const DEFAULT_WEEK_START = 1
const STACK_FONT_SCALE = 1.3

interface PreferencesBodyProps {
  loading: boolean
  error: Error | null
  onRetry: () => void
  children: ReactNode
}

const PreferencesBody = ({ loading, error, onRetry, children }: PreferencesBodyProps) => {
  const { t } = useTranslation()

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator accessibilityLabel={t('common.loading')} />
      </View>
    )
  }

  if (error) {
    return (
      <View style={styles.errorBlock}>
        <AppText variant="body" tone="error">
          {error.message}
        </AppText>
        <Button variant="secondary" size="sm" label={t('common.tryAgain')} onPress={onRetry} />
      </View>
    )
  }

  return <>{children}</>
}

const PreferencesSection = () => {
  const { t, i18n } = useTranslation()
  const { preferences, isLoading, error, refetch, update } = usePreferences()
  const showActionMenu = useActionMenu()
  const { fontScale } = useWindowDimensions()
  const { showSpinner } = useScreenLoading(isLoading)
  const { mode: appearanceMode, setMode: setAppearanceMode } = useAppearanceMode()

  const unitOptions = useMemo(() => UNIT_OPTIONS.map(({ value, labelKey }) => ({ value, label: t(labelKey) })), [t])
  const appearanceOptions = useMemo(
    () => APPEARANCE_OPTIONS.map(({ value, labelKey }) => ({ value, label: t(labelKey) })),
    [t],
  )

  const languageCode = preferences?.language ?? i18n.language
  const languageLabel = t(LANGUAGES.find((language) => language.code === languageCode)?.labelKey ?? 'languages.en')
  const weekStartDay = preferences?.week_start_day ?? DEFAULT_WEEK_START
  const weekStartLabel = t(WEEK_START_OPTIONS.find((option) => option.value === weekStartDay)?.labelKey ?? 'settings.monday')
  const unitSystem: UnitSystem = preferences?.unit_system === 'imperial' ? 'imperial' : 'metric'

  const stacked = fontScale > STACK_FONT_SCALE
  const segmentStyle = useMemo(() => [styles.segment, stacked && styles.segmentStacked], [stacked])

  const savePreferences = useCallback(
    (data: Partial<UserPreferences>) => {
      update.mutate(data, {
        onError: (e) => Alert.alert(t('common.somethingWentWrong'), e instanceof Error ? e.message : t('settings.failedToSave')),
      })
    },
    [update, t],
  )

  const handleUnitChange = useCallback(
    (value: UnitSystem) => savePreferences({ unit_system: value }),
    [savePreferences],
  )

  const handleRetry = useCallback(() => void refetch(), [refetch])

  const handleLanguageChange = useCallback(
    (code: string) => {
      void i18n.changeLanguage(code)
      void persistLanguage(code)
      savePreferences({ language: code })
    },
    [i18n, savePreferences],
  )

  const handleLanguagePicker = useCallback(() => {
    const options = LANGUAGES.map(({ code, labelKey }) => ({
      label: t(labelKey),
      selected: code === languageCode,
      onPress: () => handleLanguageChange(code),
    }))

    showActionMenu({ options })
  }, [t, showActionMenu, languageCode, handleLanguageChange])

  const handleWeekStartPicker = useCallback(() => {
    const options = WEEK_START_OPTIONS.map(({ value, labelKey }) => ({
      label: t(labelKey),
      selected: value === weekStartDay,
      onPress: () => savePreferences({ week_start_day: value }),
    }))

    showActionMenu({ options })
  }, [t, showActionMenu, weekStartDay, savePreferences])

  const unitsControl = useMemo(
    () => (
      <View style={segmentStyle}>
        <SegmentedControl size="sm" options={unitOptions} value={unitSystem} onChange={handleUnitChange} />
      </View>
    ),
    [segmentStyle, unitOptions, unitSystem, handleUnitChange],
  )
  const lookControl = useMemo(
    () => (
      <View style={segmentStyle}>
        <SegmentedControl size="sm" options={appearanceOptions} value={appearanceMode} onChange={setAppearanceMode} />
      </View>
    ),
    [segmentStyle, appearanceOptions, appearanceMode, setAppearanceMode],
  )

  return (
    <>
      <SectionHeader variant="caption" title={t('settings.preferences')} />
      <PreferencesBody loading={showSpinner} error={error} onRetry={handleRetry}>
        <SettingsGroup>
          <SettingsRow icon="scalemass" title={t('settings.units')} accessory={unitsControl} stacked={stacked} />
          <SettingsRow
            icon="globe"
            title={t('settings.language')}
            value={languageLabel}
            accessory="chevron"
            onPress={handleLanguagePicker}
          />
          <SettingsRow
            icon="calendar"
            title={t('settings.weekStartsOn')}
            value={weekStartLabel}
            accessory="chevron"
            onPress={handleWeekStartPicker}
          />
          <SettingsRow icon="circle.lefthalf.filled" title={t('settings.look')} accessory={lookControl} stacked={stacked} />
        </SettingsGroup>
      </PreferencesBody>
    </>
  )
}

export default PreferencesSection
