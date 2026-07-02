import { useState } from 'react'
import { StyleSheet, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { colors } from '../../theme/colors'

const CompleteProfileScreen = () => {
  const { t } = useTranslation()
  const { completeSignup } = useAuth()
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!password || submitting) return
    setError(null)
    setSubmitting(true)
    try {
      await completeSignup(password, nickname || undefined)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('auth.createAccount') + ' failed')
      setSubmitting(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.outer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t('auth.completeProfileTitle')}</Text>
        <Text style={styles.subtitle}>{t('auth.completeProfileSubtitle')}</Text>

        {error && <Text style={styles.error}>{error}</Text>}

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
          onSubmitEditing={handleSubmit}
          accessibilityLabel={t('auth.nickname')}
        />

        <Pressable
          style={({ pressed }) => [styles.button, styles.buttonPrimary, pressed && { opacity: 0.7 }]}
          onPress={handleSubmit}
          disabled={submitting || !password}
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
})

export default CompleteProfileScreen
