import { useCallback, useMemo, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { Stack, useRouter } from 'expo-router'
import { useHeaderHeight } from 'expo-router/react-navigation'
import * as Sentry from '@sentry/react-native'
import Constants from 'expo-constants'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AppText, Button } from '../../components/ui'
import { errorHaptic, successHaptic } from '../../components/ui/haptics'
import { useAuth } from '../../context/AuthContext'
import { useHousehold } from '../../context/HouseholdContext'
import { useAnnounce } from '../../hooks/useAnnounce'
import { useResolvedTone } from '../../hooks/useResolvedTone'
import { palette, space, useMotion } from '../../theme'
import SuccessState from './SuccessState'
import { styles } from './styles'

const BugReportScreen = () => {
  const { t } = useTranslation()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const headerHeight = useHeaderHeight()
  const { fade, exiting, layout } = useMotion()
  const { user } = useAuth()
  const { activeHouseholdId } = useHousehold()

  const [description, setDescription] = useState('')
  const textAreaBorder = useResolvedTone('dividerCard')
  const textAreaStyle = useMemo(() => [styles.textArea, { borderColor: textAreaBorder }], [textAreaBorder])
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submittingRef = useRef(false)

  const hasText = description.trim().length > 0

  useAnnounce(error)

  const handleBack = useCallback(() => router.back(), [router])

  const handleSubmit = useCallback(async () => {
    if (!hasText || submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    setError(null)

    try {
      const appVersion = `${Constants.expoConfig?.version ?? ''} (${Constants.expoConfig?.ios?.buildNumber ?? ''})`
      Sentry.captureFeedback(
        { message: description.trim(), email: user?.email || undefined },
        {
          captureContext: {
            tags: {
              appVersion,
              userId: user?.id ?? '',
              householdId: activeHouseholdId ?? '',
            },
          },
        },
      )
      if (!__DEV__) {
        const flushed = await Sentry.flush()
        if (!flushed) throw new Error('flush-timeout')
      }
    } catch (err) {
      console.error('[bug-report] submit failed', err)
      errorHaptic()
      setError(t('bugReport.sendFailed'))
      submittingRef.current = false
      setSubmitting(false)
      return
    }

    successHaptic()
    setSent(true)
    setSubmitting(false)
  }, [hasText, description, user, activeHouseholdId, t])

  const headerOptions = useMemo(
    () => ({
      title: t('bugReport.title'),
      headerLeft: () => (
        <Pressable onPress={handleBack} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
          <AppText variant="body" tone="actionText">
            {t('common.cancel')}
          </AppText>
        </Pressable>
      ),
    }),
    [t, handleBack],
  )

  const containerStyle = [styles.container, { paddingTop: headerHeight + space.lg, paddingBottom: insets.bottom + space.lg }]

  return (
    <>
      <Stack.Screen options={headerOptions} />
      <KeyboardAvoidingView style={styles.outer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={containerStyle}>
          {sent ? (
            <SuccessState onBack={handleBack} />
          ) : (
            <Animated.View key="form" entering={fade} exiting={exiting} layout={layout} style={styles.form}>
              <AppText variant="subtitle" tone="textSecondary">
                {t('bugReport.intro')}
              </AppText>
              {error ? (
                <AppText variant="meta" tone="error" accessibilityLiveRegion="polite">
                  {error}
                </AppText>
              ) : null}
              <TextInput
                style={textAreaStyle}
                placeholder={t('bugReport.placeholder')}
                placeholderTextColor={palette.placeholder}
                value={description}
                onChangeText={setDescription}
                multiline
                autoFocus
                textAlignVertical="top"
                accessibilityLabel={t('bugReport.title')}
              />
              <Button
                variant={hasText ? 'primary' : 'secondary'}
                size="xl"
                fullWidth
                label={t('bugReport.send')}
                onPress={handleSubmit}
                loading={submitting}
                disabled={!hasText}
              />
            </Animated.View>
          )}
        </View>
      </KeyboardAvoidingView>
    </>
  )
}

export default BugReportScreen
