import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import * as Sentry from '@sentry/react-native'
import Constants from 'expo-constants'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../src/theme/colors'
import { useAuth } from '../src/context/AuthContext'
import { useHousehold } from '../src/context/HouseholdContext'

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

const base64ToBytes = (base64: string): Uint8Array => {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '')
  const byteLength = Math.floor((clean.length * 6) / 8)
  const bytes = new Uint8Array(byteLength)
  let bitBuffer = 0
  let bitCount = 0
  let byteIndex = 0
  for (let i = 0; i < clean.length; i++) {
    bitBuffer = (bitBuffer << 6) | BASE64_CHARS.indexOf(clean[i])
    bitCount += 6
    if (bitCount >= 8) {
      bitCount -= 8
      bytes[byteIndex++] = (bitBuffer >> bitCount) & 0xff
    }
  }
  return bytes
}

const BugReportScreen = () => {
  const { t } = useTranslation()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const { activeHouseholdId } = useHousehold()
  const params = useLocalSearchParams<{ shot?: string; route?: string }>()

  const [description, setDescription] = useState('')
  const [email, setEmail] = useState(user?.email ?? '')
  const [shot, setShot] = useState(params.shot)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = description.trim().length > 0 && !submitting

  const handleRemoveScreenshot = useCallback(() => setShot(undefined), [])

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const appVersion = `${Constants.expoConfig?.version ?? ''} (${Constants.expoConfig?.ios?.buildNumber ?? ''})`
      Sentry.captureFeedback(
        { message: description.trim(), email: email.trim() || undefined },
        {
          captureContext: {
            tags: {
              route: params.route ?? '',
              appVersion,
              userId: user?.id ?? '',
              householdId: activeHouseholdId ?? '',
            },
          },
          attachments: shot
            ? [{ filename: 'screenshot.png', data: base64ToBytes(shot), contentType: 'image/png' }]
            : [],
        },
      )
      const flushed = await Sentry.flush()
      if (!flushed) throw new Error('flush-timeout')
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      Alert.alert(t('bugReport.success'), undefined, [{ text: t('common.ok'), onPress: () => router.back() }])
    } catch {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      setError(t('bugReport.sendFailed'))
      setSubmitting(false)
    }
  }, [canSubmit, description, email, params.route, user, activeHouseholdId, shot, router, t])

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
        <View style={[styles.container, { paddingBottom: insets.bottom + 16 }]}>
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

          <Text style={styles.label}>{t('bugReport.emailLabel')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('bugReport.emailLabel')}
            placeholderTextColor={colors.placeholderText}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="done"
            accessibilityLabel={t('bugReport.emailLabel')}
          />

          {shot && (
            <View style={styles.screenshotWrap}>
              <Text style={styles.label}>{t('bugReport.screenshot')}</Text>
              <View style={styles.screenshotRow}>
                <Image source={{ uri: `data:image/png;base64,${shot}` }} style={styles.thumb} />
                <Pressable
                  onPress={handleRemoveScreenshot}
                  hitSlop={8}
                  style={({ pressed }) => [styles.removeBtn, pressed && { opacity: 0.7 }]}
                  accessibilityLabel={t('bugReport.removeScreenshot')}
                  accessibilityRole="button"
                >
                  <Feather name="x-circle" size={20} color={colors.secondaryLabel} />
                </Pressable>
              </View>
            </View>
          )}

          <Pressable
            style={({ pressed }) => [
              styles.button,
              !canSubmit && styles.buttonDisabled,
              pressed && canSubmit && { opacity: 0.7 },
            ]}
            onPress={handleSubmit}
            disabled={!canSubmit}
            accessibilityLabel={t('bugReport.submit')}
            accessibilityRole="button"
          >
            {submitting ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <Text style={styles.buttonText}>{t('bugReport.submit')}</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </>
  )
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
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
  input: {
    borderWidth: 1,
    borderColor: colors.opaqueSeparator,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 20,
    color: colors.label,
    backgroundColor: colors.background,
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
  screenshotWrap: { marginBottom: 20 },
  screenshotRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  thumb: { width: 80, height: 140, borderRadius: 8, backgroundColor: colors.secondaryBackground },
  removeBtn: { padding: 4 },
  button: { borderRadius: 8, paddingVertical: 14, alignItems: 'center', backgroundColor: colors.blue },
  buttonDisabled: { backgroundColor: colors.gray4 },
  buttonText: { color: colors.background, fontSize: 16, fontWeight: '600' },
})

export default BugReportScreen
