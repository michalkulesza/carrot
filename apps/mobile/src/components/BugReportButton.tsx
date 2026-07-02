import { useCallback } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import { useRouter, usePathname } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { captureScreen } from 'react-native-view-shot'
import { colors } from '../theme/colors'

const BugReportButton = () => {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()

  const handlePress = useCallback(async () => {
    let shot: string | undefined
    try {
      shot = await captureScreen({ format: 'png', result: 'base64' })
    } catch {
      shot = undefined
    }
    router.push({ pathname: '/bug-report', params: { route: pathname, ...(shot ? { shot } : {}) } })
  }, [router, pathname])

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={8}
      style={({ pressed }) => [styles.btn, pressed && { opacity: 0.7 }]}
      accessibilityLabel={t('bugReport.title')}
      accessibilityRole="button"
    >
      <Feather name="alert-triangle" size={22} color={colors.secondaryLabel} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  btn: { padding: 4 },
})

export default BugReportButton
