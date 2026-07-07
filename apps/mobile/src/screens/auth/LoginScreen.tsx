import { useState } from 'react'
import { Image, StyleSheet, Text, TextInput, Pressable, View, KeyboardAvoidingView, Platform } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { Controller, useForm } from 'react-hook-form'
import { AntDesign } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useAuth } from '../../context/AuthContext'
import { colors } from '../../theme/colors'
import { EMAIL_PATTERN } from '../../utils/validation'

const NOT_VERIFIED = 'LOGIN_USER_NOT_VERIFIED'

interface LoginFormValues {
  email: string
  password: string
}

const LoginScreen = () => {
  const router = useRouter()
  const { t } = useTranslation()
  const { login, loginWithGoogle } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [googleSubmitting, setGoogleSubmitting] = useState(false)

  const {
    control,
    handleSubmit,
    clearErrors,
    formState: { errors },
  } = useForm<LoginFormValues>({ defaultValues: { email: '', password: '' } })

  const onSubmit = async (values: LoginFormValues) => {
    setError(null)
    setSubmitting(true)
    try {
      await login(values.email, values.password)
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      setError(msg === NOT_VERIFIED ? t('auth.notVerifiedError') : (msg || t('auth.signIn') + ' failed'))
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
      <View style={styles.container}>
        <View style={styles.logoRow}>
          <Image
            source={require('../../../assets/icon.png')}
            style={styles.logoIcon}
            resizeMode="contain"
            accessible={false}
          />
          <Text style={styles.logoText} accessibilityRole="header">{t('auth.brandName')}</Text>
        </View>

        <Text style={styles.tagline}>{t('auth.tagline')}</Text>

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
                returnKeyType="next"
                accessibilityLabel={t('auth.email')}
              />
              {errors.email && <Text style={styles.fieldError}>{errors.email.message}</Text>}
            </View>
          )}
        />

        <Controller
          control={control}
          name="password"
          rules={{ required: t('auth.passwordRequired') }}
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
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="done"
                onSubmitEditing={handleSubmit(onSubmit)}
                accessibilityLabel={t('auth.password')}
              />
              {errors.password && <Text style={styles.fieldError}>{errors.password.message}</Text>}
            </View>
          )}
        />

        <Pressable
          style={({ pressed }) => [styles.button, styles.buttonPrimary, pressed && { opacity: 0.7 }]}
          onPress={handleSubmit(onSubmit)}
          disabled={submitting}
          accessibilityLabel={t('auth.signIn')}
          accessibilityRole="button"
        >
          <Text style={styles.buttonPrimaryText}>
            {submitting ? t('auth.signingIn') : t('auth.signIn')}
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}
          onPress={() => router.push('/(auth)/register')}
          accessibilityLabel={t('auth.createAccount')}
          accessibilityRole="button"
        >
          <Text style={styles.buttonOutlineText}>{t('auth.noAccount')} {t('auth.createOne')}</Text>
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
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  logoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 16 },
  logoIcon: { width: 56, height: 56, borderRadius: 14 },
  logoText: { fontSize: 34, lineHeight: 41, fontWeight: '700', color: colors.brandText },
  tagline: { fontSize: 20, lineHeight: 25, fontWeight: '600', textAlign: 'center', marginBottom: 32, color: colors.label },
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

export default LoginScreen
