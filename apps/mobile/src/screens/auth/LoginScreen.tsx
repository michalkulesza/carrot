import { useCallback, useState } from 'react'
import { StyleSheet, Text, TextInput, Pressable, View, KeyboardAvoidingView, Platform } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { useAuth } from '../../context/AuthContext'
import { colors } from '../../theme/colors'

const NOT_VERIFIED = 'LOGIN_USER_NOT_VERIFIED'

const LoginScreen = () => {
  const router = useRouter()
  const { t } = useTranslation()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const fillDemo = useCallback(() => {
    setEmail('demo@demo.com')
    setPassword('demo')
  }, [])

  const fillDemoAlt = useCallback(() => {
    setEmail('alt@demo.com')
    setPassword('demo')
  }, [])

  const handleLogin = async () => {
    if (!email || !password) return
    setError(null)
    setSubmitting(true)
    try {
      await login(email, password)
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      setError(msg === NOT_VERIFIED ? t('auth.notVerifiedError') : (msg || t('auth.signIn') + ' failed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.outer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <Text style={styles.tagline}>{t('auth.tagline')}</Text>

        {error && <Text style={styles.error}>{error}</Text>}

        <TextInput
          style={styles.input}
          placeholder={t('auth.email')}
          placeholderTextColor={colors.placeholderText}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
          accessibilityLabel={t('auth.email')}
        />
        <TextInput
          style={styles.input}
          placeholder={t('auth.password')}
          placeholderTextColor={colors.placeholderText}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="done"
          accessibilityLabel={t('auth.password')}
        />

        <Pressable
          style={({ pressed }) => [styles.button, styles.buttonPrimary, pressed && { opacity: 0.7 }]}
          onPress={handleLogin}
          disabled={submitting}
          accessibilityLabel={t('auth.signIn')}
          accessibilityRole="button"
        >
          <Text style={styles.buttonPrimaryText}>
            {submitting ? t('auth.signingIn') : t('auth.signIn')}
          </Text>
        </Pressable>

        <View style={styles.demoRow}>
          <Pressable
            style={({ pressed }) => [styles.demoBtn, styles.buttonDemo, pressed && { opacity: 0.7 }]}
            onPress={fillDemo}
            accessibilityLabel={t('auth.demoAccount')}
            accessibilityRole="button"
          >
            <Text style={styles.buttonDemoText}>{t('auth.demoAccount')}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.demoBtn, styles.buttonDemo, pressed && { opacity: 0.7 }]}
            onPress={fillDemoAlt}
            accessibilityLabel={t('auth.demoAlt')}
            accessibilityRole="button"
          >
            <Text style={styles.buttonDemoText}>{t('auth.demoAlt')}</Text>
          </Pressable>
        </View>

        <Pressable
          style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}
          onPress={() => router.push('/(auth)/register')}
          accessibilityLabel={t('auth.createAccount')}
          accessibilityRole="button"
        >
          <Text style={styles.buttonOutlineText}>{t('auth.noAccount')} {t('auth.createOne')}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  tagline: { fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: 40, color: colors.label },
  error: { color: colors.red, marginBottom: 12, textAlign: 'center' },
  input: {
    borderWidth: 1,
    borderColor: colors.opaqueSeparator,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 14,
    backgroundColor: colors.background,
  },
  button: { borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginBottom: 10 },
  buttonPrimary: { backgroundColor: colors.blue },
  buttonPrimaryText: { color: colors.background, fontSize: 16, fontWeight: '600' },
  demoRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  demoBtn: { flex: 1, borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  buttonDemo: { borderWidth: 1, borderColor: colors.opaqueSeparator },
  buttonDemoText: { color: colors.secondaryLabel, fontSize: 16 },
  buttonOutlineText: { color: colors.secondaryLabel, fontSize: 16 },
})

export default LoginScreen
