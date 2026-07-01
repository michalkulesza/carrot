import { useCallback, useEffect, useRef, useState } from 'react'
import {
  KeyboardAvoidingView,
  PlatformColor,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../../context/AuthContext'

const RESEND_COOLDOWN = 60

const VerifyScreen = () => {
  const { t } = useTranslation()
  const { pendingEmail, verifyCode, resendCode } = useAuth()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const inputRef = useRef<TextInput>(null)

  useEffect(() => {
    if (!pendingEmail) {
      router.replace('/(auth)/login')
    }
  }, [pendingEmail])

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300)
  }, [])

  const startCooldown = useCallback(() => {
    setCooldown(RESEND_COOLDOWN)
    intervalRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current) }, [])

  const handleVerify = async () => {
    if (!pendingEmail || code.length < 6 || submitting) return
    setError(null)
    setSubmitting(true)
    try {
      await verifyCode(pendingEmail, code)
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch (e) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      setError(e instanceof Error ? e.message : t('auth.invalidCode'))
      setCode('')
    } finally {
      setSubmitting(false)
    }
  }

  const handleResend = async () => {
    if (!pendingEmail || cooldown > 0) return
    try {
      await resendCode(pendingEmail)
      startCooldown()
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    } catch {
      // request-verify-code always returns 200; ignore errors
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.container, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.content}>
        <Text style={styles.title}>{t('auth.verifyTitle')}</Text>
        <Text style={styles.subtitle}>
          {t('auth.verifySubtitle', { email: pendingEmail ?? '' })}
        </Text>

        <TextInput
          ref={inputRef}
          style={[styles.codeInput, error ? styles.codeInputError : null]}
          value={code}
          onChangeText={(v) => {
            setError(null)
            setCode(v.replace(/\D/g, '').slice(0, 6))
          }}
          placeholder={t('auth.codePlaceholder')}
          placeholderTextColor={PlatformColor('systemGray2') as unknown as string}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={6}
          returnKeyType="done"
          onSubmitEditing={handleVerify}
          editable={!submitting}
          accessibilityLabel={t('auth.codePlaceholder')}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          onPress={handleVerify}
          disabled={code.length < 6 || submitting}
          hitSlop={8}
          style={({ pressed }) => [
            styles.button,
            (code.length < 6 || submitting) && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={submitting ? t('auth.verifying') : t('auth.verify')}
        >
          <Text style={styles.buttonText}>
            {submitting ? t('auth.verifying') : t('auth.verify')}
          </Text>
        </Pressable>

        <Pressable
          onPress={handleResend}
          disabled={cooldown > 0}
          hitSlop={8}
          style={styles.resendButton}
          accessibilityRole="button"
          accessibilityLabel={cooldown > 0 ? t('auth.resendIn', { seconds: cooldown }) : t('auth.resendCode')}
        >
          <Text style={[styles.resendText, cooldown > 0 && styles.resendTextDisabled]}>
            {cooldown > 0 ? t('auth.resendIn', { seconds: cooldown }) : t('auth.resendCode')}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

export default VerifyScreen

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PlatformColor('systemBackground') as unknown as string,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 34,
    color: PlatformColor('label') as unknown as string,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 21,
    color: PlatformColor('secondaryLabel') as unknown as string,
    marginBottom: 32,
  },
  codeInput: {
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 34,
    letterSpacing: 8,
    textAlign: 'center',
    backgroundColor: PlatformColor('secondarySystemBackground') as unknown as string,
    color: PlatformColor('label') as unknown as string,
    borderRadius: 12,
    paddingVertical: 20,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  codeInputError: {
    borderWidth: 1,
    borderColor: PlatformColor('systemRed') as unknown as string,
  },
  error: {
    fontSize: 13,
    lineHeight: 18,
    color: PlatformColor('systemRed') as unknown as string,
    marginBottom: 16,
    textAlign: 'center',
  },
  button: {
    backgroundColor: PlatformColor('systemBlue') as unknown as string,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
    minHeight: 44,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 21,
    color: '#ffffff',
  },
  resendButton: {
    alignItems: 'center',
    paddingVertical: 12,
    minHeight: 44,
  },
  resendText: {
    fontSize: 16,
    lineHeight: 21,
    color: PlatformColor('systemBlue') as unknown as string,
  },
  resendTextDisabled: {
    color: PlatformColor('systemGray') as unknown as string,
  },
})
