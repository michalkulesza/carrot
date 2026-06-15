import { useState } from 'react'
import { StyleSheet, Text, TextInput, Pressable, View, KeyboardAvoidingView, Platform, ScrollView } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useAuth } from '../../context/AuthContext'
import type { AuthStackParamList } from '../../navigation/AuthStack'
import { colors } from '../../theme/colors'

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>

const RegisterScreen = ({ navigation }: Props) => {
  const { t } = useTranslation()
  const { register } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleRegister = async () => {
    if (!email || !password) return
    setError(null)
    setSubmitting(true)
    try {
      await register({ email, password, nickname: nickname || undefined })
    } catch (e) {
      setError(e instanceof Error ? e.message : t('auth.createAccount') + ' failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.outer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t('auth.createAccount')}</Text>

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
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="next"
          accessibilityLabel={t('auth.password')}
        />
        <TextInput
          style={styles.input}
          placeholder={t('auth.nickname')}
          placeholderTextColor={colors.placeholderText}
          value={nickname}
          onChangeText={setNickname}
          autoCapitalize="words"
          autoCorrect={false}
          textContentType="username"
          returnKeyType="done"
          accessibilityLabel={t('auth.nickname')}
        />

        <Pressable
          style={({ pressed }) => [styles.button, styles.buttonPrimary, pressed && { opacity: 0.7 }]}
          onPress={handleRegister}
          disabled={submitting}
          accessibilityLabel={t('auth.createAccount')}
          accessibilityRole="button"
        >
          <Text style={styles.buttonPrimaryText}>
            {submitting ? t('auth.creating') : t('auth.createAccount')}
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}
          onPress={() => navigation.navigate('Login')}
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
  title: { fontSize: 26, fontWeight: '700', textAlign: 'center', marginBottom: 32, color: colors.label },
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
  buttonOutlineText: { color: colors.secondaryLabel, fontSize: 15 },
})

export default RegisterScreen
