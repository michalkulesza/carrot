import { useCallback, useEffect, useRef, useState } from 'react'
import {
  InputAccessoryView,
  KeyboardAvoidingView,
  Platform,
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
import { Controller, useForm } from 'react-hook-form'
import { useAuth } from '../../context/AuthContext'

const RESEND_COOLDOWN = 60
const CODE_ACCESSORY_ID = 'verify-code-accessory'

const ERROR_KEYS: Record<string, string> = {
  SIGNUP_CODE_INVALID: 'auth.codeInvalid',
  SIGNUP_CODE_EXPIRED: 'auth.codeExpired',
  SIGNUP_CODE_TOO_MANY_ATTEMPTS: 'auth.codeTooManyAttempts',
}

interface VerifyFormValues {
  code: string
}

const VerifyScreen = () => {
  const { t } = useTranslation()
  const { signupEmail, verifySignupCode, requestSignupCode } = useAuth()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const inputRef = useRef<TextInput>(null)

  const {
    control,
    handleSubmit,
    clearErrors,
    setValue,
    formState: { errors },
  } = useForm<VerifyFormValues>({ defaultValues: { code: '' } })

  useEffect(() => {
    if (!signupEmail) {
      router.replace('/(auth)/login')
    }
  }, [signupEmail])

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

  const onSubmit = async (values: VerifyFormValues) => {
    if (!signupEmail) return
    setError(null)
    setSubmitting(true)
    try {
      await verifySignupCode(signupEmail, values.code)
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      router.push('/(auth)/complete-profile')
    } catch (e) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      const msg = e instanceof Error ? e.message : ''
      setError(t(ERROR_KEYS[msg] ?? 'auth.invalidCode'))
      setValue('code', '')
    } finally {
      setSubmitting(false)
    }
  }

  const handleResend = async () => {
    if (!signupEmail || cooldown > 0) return
    try {
      await requestSignupCode(signupEmail)
      startCooldown()
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    } catch {
      // ignore — cooldown UI already reflects the attempt
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.container, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.content}>
        <Text style={styles.title}>{t('auth.verifyTitle')}</Text>
        <Text style={styles.subtitle}>
          {t('auth.verifySubtitle', { email: signupEmail ?? '' })}
        </Text>

        <Controller
          control={control}
          name="code"
          rules={{
            required: t('auth.codeRequired'),
            minLength: { value: 6, message: t('auth.codeRequired') },
          }}
          render={({ field: { value, onChange } }) => (
            <>
              <TextInput
                ref={inputRef}
                style={[styles.codeInput, (errors.code || error) ? styles.codeInputError : null]}
                value={value}
                onChangeText={(v) => {
                  clearErrors('code')
                  setError(null)
                  onChange(v.replace(/\D/g, '').slice(0, 6))
                }}
                placeholder={t('auth.codePlaceholder')}
                placeholderTextColor={PlatformColor('systemGray2') as unknown as string}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                maxLength={6}
                inputAccessoryViewID={Platform.OS === 'ios' ? CODE_ACCESSORY_ID : undefined}
                editable={!submitting}
                accessibilityLabel={t('auth.codePlaceholder')}
              />
              {errors.code && <Text style={styles.error}>{errors.code.message}</Text>}
            </>
          )}
        />

        {!errors.code && error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          onPress={handleSubmit(onSubmit)}
          disabled={submitting}
          hitSlop={8}
          style={({ pressed }) => [
            styles.button,
            submitting && styles.buttonDisabled,
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

      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID={CODE_ACCESSORY_ID}>
          <View style={styles.accessoryBar}>
            <Pressable onPress={() => inputRef.current?.blur()} hitSlop={8}>
              <Text style={styles.accessoryDoneText}>{t('common.done')}</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      )}
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
  accessoryBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: PlatformColor('secondarySystemBackground') as unknown as string,
  },
  accessoryDoneText: {
    fontSize: 16,
    fontWeight: '600',
    color: PlatformColor('systemBlue') as unknown as string,
  },
})
