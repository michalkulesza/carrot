import { useEffect, useState } from 'react'
import { Keyboard, StyleSheet, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { Controller, useForm } from 'react-hook-form'
import { useAuth } from '../../context/AuthContext'
import { colors } from '../../theme/colors'

const PASSWORD_TOO_SHORT = 'PASSWORD_TOO_SHORT'

interface CompleteProfileFormValues {
  password: string
  nickname: string
}

const CompleteProfileScreen = () => {
  const { t } = useTranslation()
  const router = useRouter()
  const { signupToken, completeSignup, user } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const {
    control,
    handleSubmit,
    clearErrors,
    formState: { errors },
  } = useForm<CompleteProfileFormValues>({ defaultValues: { password: '', nickname: '' } })

  useEffect(() => {
    // Once completeSignup succeeds, signupToken clears and `user` becomes set in the same
    // render — don't bounce to login in that case, just let the root layout swap to the
    // main app while this screen still shows its "creating account" loading state.
    if (!signupToken && !user) {
      router.replace('/(auth)/login')
    }
  }, [signupToken, user])

  const onSubmit = async (values: CompleteProfileFormValues) => {
    // Dismiss up front — otherwise the keyboard closing collides with the route
    // transition to the main app and the password field visibly clears mid-swap.
    Keyboard.dismiss()
    setError(null)
    setSubmitting(true)
    try {
      await completeSignup(values.password, values.nickname || undefined)
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      setError(msg === PASSWORD_TOO_SHORT ? t('auth.passwordTooShort') : (msg || t('auth.createAccount') + ' failed'))
      setSubmitting(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.outer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t('auth.completeProfileTitle')}</Text>
        <Text style={styles.subtitle}>{t('auth.completeProfileSubtitle')}</Text>

        {error && <Text style={styles.error}>{error}</Text>}

        <Controller
          control={control}
          name="password"
          rules={{
            required: t('auth.passwordRequired'),
            minLength: { value: 8, message: t('auth.passwordTooShort') },
          }}
          render={({ field: { value, onChange } }) => (
            <View style={styles.field}>
              <TextInput
                style={styles.input}
                placeholder={t('auth.password')}
                placeholderTextColor={colors.placeholderText}
                value={value}
                onChangeText={(v) => {
                  clearErrors('password')
                  onChange(v)
                }}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="next"
                accessibilityLabel={t('auth.password')}
              />
              {errors.password && <Text style={styles.fieldError}>{errors.password.message}</Text>}
            </View>
          )}
        />

        <Controller
          control={control}
          name="nickname"
          rules={{
            maxLength: { value: 50, message: t('auth.nicknameTooLong') },
          }}
          render={({ field: { value, onChange } }) => (
            <View style={styles.field}>
              <TextInput
                style={styles.input}
                placeholder={t('auth.nickname')}
                placeholderTextColor={colors.placeholderText}
                value={value}
                onChangeText={(v) => {
                  clearErrors('nickname')
                  onChange(v)
                }}
                autoCapitalize="words"
                autoCorrect={false}
                textContentType="username"
                returnKeyType="done"
                onSubmitEditing={handleSubmit(onSubmit)}
                accessibilityLabel={t('auth.nickname')}
              />
              {errors.nickname && <Text style={styles.fieldError}>{errors.nickname.message}</Text>}
            </View>
          )}
        />

        <Pressable
          style={({ pressed }) => [styles.button, styles.buttonPrimary, pressed && { opacity: 0.7 }]}
          onPress={handleSubmit(onSubmit)}
          disabled={submitting}
          accessibilityLabel={t('auth.createAccount')}
          accessibilityRole="button"
        >
          <Text style={styles.buttonPrimaryText}>
            {submitting ? t('auth.creating') : t('auth.createAccount')}
          </Text>
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
})

export default CompleteProfileScreen
