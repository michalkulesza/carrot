import { useState } from 'react'
import { StyleSheet, Text, TextInput, Pressable, View, KeyboardAvoidingView, Platform, ScrollView } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { Controller, useForm } from 'react-hook-form'
import { AntDesign } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useAuth } from '../../context/AuthContext'
import { colors } from '../../theme/colors'
import { EMAIL_PATTERN } from '../../utils/validation'

const ACCOUNT_EXISTS = 'ACCOUNT_EXISTS'
const ACCOUNT_EXISTS_GOOGLE = 'ACCOUNT_EXISTS_GOOGLE'

interface RegisterFormValues {
  email: string
}

const RegisterScreen = () => {
  const router = useRouter()
  const { t } = useTranslation()
  const { requestSignupCode, loginWithGoogle } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [googleSubmitting, setGoogleSubmitting] = useState(false)

  const {
    control,
    handleSubmit,
    clearErrors,
    formState: { errors },
  } = useForm<RegisterFormValues>({ defaultValues: { email: '' } })

  const onSubmit = async (values: RegisterFormValues) => {
    setError(null)
    setSubmitting(true)
    try {
      await requestSignupCode(values.email)
      router.push('/(auth)/verify')
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (msg === ACCOUNT_EXISTS_GOOGLE) {
        setError(t('auth.accountExistsGoogleError'))
      } else if (msg === ACCOUNT_EXISTS) {
        setError(t('auth.accountExistsError'))
      } else {
        setError(msg || t('auth.createAccount') + ' failed')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const onGooglePress = async () => {
    setError(null)
    setGoogleSubmitting(true)
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    try {
      await loginWithGoogle()
    } catch {
      setError(t('auth.googleSignInError'))
    } finally {
      setGoogleSubmitting(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.outer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t('auth.createAccount')}</Text>
        <Text style={styles.subtitle}>{t('auth.signupEmailSubtitle')}</Text>

        {error && <Text style={styles.error}>{error}</Text>}

        <Controller
          control={control}
          name="email"
          rules={{
            required: t('auth.emailRequired'),
            pattern: { value: EMAIL_PATTERN, message: t('auth.emailInvalid') },
          }}
          render={({ field: { value, onChange } }) => (
            <View style={styles.field}>
              <TextInput
                style={styles.input}
                placeholder={t('auth.email')}
                placeholderTextColor={colors.placeholderText}
                value={value}
                onChangeText={(v) => {
                  clearErrors('email')
                  onChange(v)
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="done"
                onSubmitEditing={handleSubmit(onSubmit)}
                accessibilityLabel={t('auth.email')}
              />
              {errors.email && <Text style={styles.fieldError}>{errors.email.message}</Text>}
            </View>
          )}
        />

        <Pressable
          style={({ pressed }) => [styles.button, styles.buttonPrimary, pressed && { opacity: 0.7 }]}
          onPress={handleSubmit(onSubmit)}
          disabled={submitting}
          accessibilityLabel={t('auth.continue')}
          accessibilityRole="button"
        >
          <Text style={styles.buttonPrimaryText}>
            {submitting ? t('auth.creating') : t('auth.continue')}
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}
          onPress={() => router.back()}
          accessibilityLabel={t('auth.alreadyHaveAccount')}
          accessibilityRole="button"
        >
          <Text style={styles.buttonOutlineText}>{t('auth.alreadyHaveAccount')}</Text>
        </Pressable>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>{t('auth.orDivider')}</Text>
          <View style={styles.dividerLine} />
        </View>

        <Pressable
          style={({ pressed }) => [styles.button, styles.buttonGoogle, pressed && { opacity: 0.7 }]}
          onPress={onGooglePress}
          disabled={googleSubmitting}
          accessibilityLabel={t('auth.continueWithGoogle')}
          accessibilityRole="button"
        >
          <AntDesign name="google" size={18} color={colors.label as unknown as string} />
          <Text style={styles.buttonGoogleText}>{t('auth.continueWithGoogle')}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: 8, color: colors.label },
  subtitle: { fontSize: 16, textAlign: 'center', marginBottom: 32, color: colors.secondaryLabel },
  error: { color: colors.red, marginBottom: 12, textAlign: 'center' },
  field: { marginBottom: 14 },
  fieldError: { color: colors.red, fontSize: 13, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.opaqueSeparator,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: colors.background,
  },
  button: { borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginBottom: 10 },
  buttonPrimary: { backgroundColor: colors.blue },
  buttonPrimaryText: { color: colors.background, fontSize: 16, fontWeight: '600' },
  buttonOutlineText: { color: colors.secondaryLabel, fontSize: 16 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.opaqueSeparator },
  dividerText: { color: colors.secondaryLabel, fontSize: 13, marginHorizontal: 12 },
  buttonGoogle: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.opaqueSeparator,
  },
  buttonGoogleText: { color: colors.label, fontSize: 16, fontWeight: '600' },
})

export default RegisterScreen
