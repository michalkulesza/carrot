import { useState } from 'react'
import { StyleSheet, Text, TextInput, Pressable, View, KeyboardAvoidingView, Platform, ScrollView } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { Controller, useForm } from 'react-hook-form'
import { useAuth } from '../../context/AuthContext'
import { colors } from '../../theme/colors'
import { EMAIL_PATTERN } from '../../utils/validation'

const ACCOUNT_EXISTS = 'ACCOUNT_EXISTS'

interface RegisterFormValues {
  email: string
}

const RegisterScreen = () => {
  const router = useRouter()
  const { t } = useTranslation()
  const { requestSignupCode } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

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
      setError(msg === ACCOUNT_EXISTS ? t('auth.accountExistsError') : (msg || t('auth.createAccount') + ' failed'))
    } finally {
      setSubmitting(false)
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
})

export default RegisterScreen
