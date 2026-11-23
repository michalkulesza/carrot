import { useCallback, useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { Stack, useRouter } from 'expo-router'
import { useHeaderHeight } from 'expo-router/react-navigation'
import * as Haptics from 'expo-haptics'
import * as Sentry from '@sentry/react-native'
import Constants from 'expo-constants'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../src/theme/colors'
import { useAuth } from '../src/context/AuthContext'
import { useHousehold } from '../src/context/HouseholdContext'
import PrimaryButton from '../src/components/PrimaryButton'

const BugReportScreen = () => {
  const { t } = useTranslation()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const headerHeight = useHeaderHeight()
  const { user } = useAuth()
  const { activeHouseholdId } = useHousehold()

  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = description.trim().length > 0 && !submitting

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const appVersion = `${Constants.expoConfig?.version ?? ''} (${Constants.expoConfig?.ios?.buildNumber ?? ''})`
      Sentry.captureFeedback(
        { message: description.trim(), email: user?.email || undefined },
        {
          captureContext: {
            tags: {
              appVersion,
              userId: user?.id ?? '',
              householdId: activeHouseholdId ?? '',
            },
          },
        },
      )
      if (!__DEV__) {
        const flushed = await Sentry.flush()
        if (!flushed) throw new Error('flush-timeout')
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      Alert.alert(t('bugReport.success'), undefined, [{ text: t('common.ok'), onPress: () => router.back() }])
    } catch (err) {
      console.error('[bug-report] submit failed', err)
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      setError(t('bugReport.sendFailed'))
      setSubmitting(false)
    }
  }, [canSubmit, description, user, activeHouseholdId, router, t])

  return (
    <>
      <Stack.Screen
        options={{
          title: t('bugReport.title'),
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView style={styles.outer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.container, { paddingTop: headerHeight + 16, paddingBottom: insets.bottom + 16 }]}>
          {error && <Text style={styles.error}>{error}</Text>}

          <Text style={styles.label}>{t('bugReport.descriptionLabel')}</Text>
          <TextInput
            style={styles.textArea}
            placeholder={t('bugReport.descriptionPlaceholder')}
            placeholderTextColor={colors.placeholderText}
            value={description}
            onChangeText={setDescription}
            multiline
            autoFocus
            textAlignVertical="top"
            accessibilityLabel={t('bugReport.descriptionLabel')}
          />

          <PrimaryButton
            onPress={handleSubmit}
            disabled={!canSubmit}
            loading={submitting}
            label={t('bugReport.submit')}
            accessibilityLabel={t('bugReport.submit')}
          />
        </View>
      </KeyboardAvoidingView>
    </>
  )
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, paddingHorizontal: 20 },
  cancelText: { color: colors.blue, fontSize: 16 },
  error: { color: colors.red, marginBottom: 12, fontSize: 13 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.secondaryLabel,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  textArea: {
    borderWidth: 1,
    borderColor: colors.opaqueSeparator,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 17,
    lineHeight: 22,
    minHeight: 120,
    marginBottom: 20,
    color: colors.label,
    backgroundColor: colors.background,
  },
})

export default BugReportScreen
