import { useCallback, useRef } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import { useRouter, usePathname } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useTranslation } from 'react-i18next'
import { colors } from '../theme/colors'
import { startBugReportScreenshot } from '../lib/bugReportScreenshot'

const BugReportButton = () => {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  const isNavigatingRef = useRef(false)

  const handlePress = useCallback(() => {
    if (isNavigatingRef.current) return
    isNavigatingRef.current = true

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    startBugReportScreenshot()
    router.push({ pathname: '/bug-report', params: { route: pathname } })

    setTimeout(() => {
      isNavigatingRef.current = false
    }, 500)
  }, [router, pathname])

  const getPressableStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [styles.btn, pressed && styles.btnPressed],
    [],
  )

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={8}
      style={getPressableStyle}
      accessibilityLabel={t('bugReport.title')}
      accessibilityRole="button"
    >
      <Feather name="alert-triangle" size={22} color={colors.secondaryLabel} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  btn: { padding: 4 },
  btnPressed: { opacity: 0.7 },
})

export default BugReportButton
