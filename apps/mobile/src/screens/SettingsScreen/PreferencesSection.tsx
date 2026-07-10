import { ActivityIndicator, Pressable, Switch, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { UserPreferences } from '@carrot/shared/types'
import { LANGUAGES, WEEK_START_OPTIONS } from './helpers'
import { styles } from './styles'

const PreferencesSection = ({
  loading,
  error,
  preferences,
  currentLanguageCode,
  onLanguagePicker,
  onWeekStartPicker,
  onUnitSystemToggle,
}: {
  loading: boolean
  error: Error | null
  preferences: UserPreferences | null | undefined
  currentLanguageCode: string
  onLanguagePicker: () => void
  onWeekStartPicker: () => void
  onUnitSystemToggle: (isMetric: boolean) => void
}) => {
  const { t } = useTranslation()

  if (loading) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator accessibilityLabel={t('common.loading')} />
      </View>
    )
  }

  if (error) {
    return (
      <View style={styles.card}>
        <Text style={styles.errorText}>{error.message}</Text>
      </View>
    )
  }

  const languageLabel = t(LANGUAGES.find((l) => l.code === currentLanguageCode)?.labelKey ?? 'languages.en')
  const weekStartLabel = t(
    WEEK_START_OPTIONS.find((o) => o.value === (preferences?.week_start_day ?? 1))?.labelKey ?? 'settings.monday',
  )

  return (
    <>
      <View style={styles.card}>
        <Pressable
          style={({ pressed }) => [styles.pickerRow, pressed && { opacity: 0.7 }]}
          onPress={onLanguagePicker}
          accessibilityLabel={t('settings.language')}
          accessibilityRole="button"
        >
          <Text style={styles.pickerLabel}>{t('settings.language')}</Text>
          <View style={styles.pickerRight}>
            <Text style={styles.pickerValue}>{languageLabel}</Text>
            <Text style={styles.pickerChevron}>›</Text>
          </View>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Pressable
          style={({ pressed }) => [styles.pickerRow, pressed && { opacity: 0.7 }]}
          onPress={onWeekStartPicker}
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
            <Text style={styles.switchLabel}>{t('settings.useMetricSystem')}</Text>
            <Text style={styles.cardDesc}>{t('settings.useMetricSystemDesc')}</Text>
          </View>
          <Switch
            value={preferences?.unit_system !== 'imperial'}
            onValueChange={onUnitSystemToggle}
            accessibilityLabel={t('settings.useMetricSystem')}
          />
        </View>
      </View>
    </>
  )
}

export default PreferencesSection
