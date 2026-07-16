import { ActivityIndicator, Pressable, Switch, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { MenuView } from '@react-native-menu/menu'
import type { UserPreferences } from '@carrot/shared/types'
import type { AppearanceMode } from '../../context/ColorSchemeContext'
import { APPEARANCE_OPTIONS, LANGUAGES } from './helpers'
import { styles } from './styles'

const PreferencesSection = ({
  loading,
  error,
  preferences,
  currentLanguageCode,
  appearanceMode,
  onLanguagePicker,
  onUnitSystemToggle,
  onAppearanceChange,
}: {
  loading: boolean
  error: Error | null
  preferences: UserPreferences | null | undefined
  currentLanguageCode: string
  appearanceMode: AppearanceMode
  onLanguagePicker: () => void
  onUnitSystemToggle: (isMetric: boolean) => void
  onAppearanceChange: (event: { nativeEvent: { event: string } }) => void
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
  const appearanceLabel = t(
    APPEARANCE_OPTIONS.find((o) => o.value === appearanceMode)?.labelKey ?? 'settings.appearanceSystem',
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

      <View style={styles.card}>
        <MenuView
          title={t('settings.appearance')}
          onPressAction={onAppearanceChange}
          actions={APPEARANCE_OPTIONS.map(({ value, labelKey }) => ({
            id: value,
            title: t(labelKey),
            state: appearanceMode === value ? 'on' : 'off',
          }))}
        >
          <View style={styles.pickerRow}>
            <Text style={styles.pickerLabel}>{t('settings.appearance')}</Text>
            <View style={styles.pickerRight}>
              <Text style={styles.pickerValue}>{appearanceLabel}</Text>
              <Text style={styles.pickerChevron}>›</Text>
            </View>
          </View>
        </MenuView>
      </View>
    </>
  )
}

export default PreferencesSection
