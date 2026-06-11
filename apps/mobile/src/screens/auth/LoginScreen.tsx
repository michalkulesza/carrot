import { useState } from 'react'
import { StyleSheet, Text, TextInput, TouchableOpacity, View, KeyboardAvoidingView, Platform } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useAuth } from '../../context/AuthContext'
import type { AuthStackParamList } from '../../navigation/AuthStack'

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>

const LoginScreen = ({ navigation }: Props) => {
  const { t } = useTranslation()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleLogin = async () => {
    if (!email || !password) return
    setError(null)
    setSubmitting(true)
    try {
      await login(email, password)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('auth.signIn') + ' failed')
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
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          accessibilityLabel={t('auth.email')}
        />
        <TextInput
          style={styles.input}
          placeholder={t('auth.password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
          accessibilityLabel={t('auth.password')}
        />

        <TouchableOpacity
          style={[styles.button, styles.buttonPrimary]}
          onPress={handleLogin}
          disabled={submitting}
          accessibilityLabel={t('auth.signIn')}
          accessibilityRole="button"
        >
          <Text style={styles.buttonPrimaryText}>
            {submitting ? t('auth.signingIn') : t('auth.signIn')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('Register')}
          accessibilityLabel={t('auth.createAccount')}
          accessibilityRole="button"
        >
          <Text style={styles.buttonOutlineText}>{t('auth.noAccount')} {t('auth.createOne')}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: '#fff' },
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  tagline: { fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: 40, color: '#111' },
  error: { color: '#dc2626', marginBottom: 12, textAlign: 'center' },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 14,
    backgroundColor: '#f9fafb',
  },
  button: { borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginBottom: 10 },
  buttonPrimary: { backgroundColor: '#2563eb' },
  buttonPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonOutlineText: { color: '#6b7280', fontSize: 15 },
})

export default LoginScreen
