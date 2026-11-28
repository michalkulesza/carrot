import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated'
import { SymbolView } from 'expo-symbols'
import { useTranslation } from 'react-i18next'
import { AppText, Button } from '../../components/ui'
import { palette, settleSpring, useMotion } from '../../theme'
import { styles } from './styles'

const CHECK_SIZE = 24
const CHECK_SPRING = { damping: 14, stiffness: 220, mass: 1 }

interface SuccessStateProps {
  onBack: () => void
}

const SuccessState = ({ onBack }: SuccessStateProps) => {
  const { t } = useTranslation()
  const { fade } = useMotion()
  const reduceMotion = useReducedMotion()
  const scale = useSharedValue(reduceMotion ? 1 : 0)

  useEffect(() => {
    if (!reduceMotion) scale.value = withSpring(1, { ...settleSpring, ...CHECK_SPRING })
  }, [scale, reduceMotion])

  const checkStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  return (
    <Animated.View style={styles.thanks} entering={fade}>
      <Animated.View style={[styles.checkCircle, checkStyle]}>
        <SymbolView name="checkmark" size={CHECK_SIZE} weight="bold" tintColor={palette.actionText} />
      </Animated.View>
      <AppText variant="groupTitle" accessibilityRole="header">
        {t('bugReport.thanksTitle')}
      </AppText>
      <AppText variant="subtitle" tone="textSecondary" style={styles.thanksText}>
        {t('bugReport.thanksBody')}
      </AppText>
      <View style={styles.thanksButton}>
        <Button variant="secondary" size="lg" label={t('bugReport.backToSettings')} onPress={onBack} />
      </View>
    </Animated.View>
  )
}

export default SuccessState
