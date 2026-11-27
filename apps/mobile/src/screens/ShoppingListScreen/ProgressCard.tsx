import { memo, useMemo } from 'react'
import { Pressable, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { AppText, ProgressBar } from '../../components/ui'
import { usePressScale } from '../../theme'
import { styles } from './styles'

interface ProgressCardProps {
  done: number
  total: number
  value: number
  canClear: boolean
  onClear: () => void
}

const CLEAR_HIT_SLOP = { top: 6, bottom: 6, left: 8, right: 8 }

const ProgressCard = ({ done, total, value, canClear, onClear }: ProgressCardProps) => {
  const { t } = useTranslation()
  const { animatedStyle, onPressIn, onPressOut } = usePressScale()

  const label = t('shoppingList.progressInCart', { done, total })
  const clearStyle = useMemo(() => [styles.clearButton, animatedStyle], [animatedStyle])

  return (
    <View style={styles.progressCard}>
      <View style={styles.progressRow}>
        <AppText variant="progressLabel" tabular style={styles.flex} accessibilityRole="text">{label}</AppText>
        {canClear ? (
          <Pressable
            onPress={onClear}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            hitSlop={CLEAR_HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={t('shoppingList.clearDone')}
          >
            <Animated.View style={clearStyle}>
              <AppText variant="button" tone="actionText">{t('shoppingList.clearDone')}</AppText>
            </Animated.View>
          </Pressable>
        ) : null}
      </View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <ProgressBar value={value} size="thick" />
      </View>
    </View>
  )
}

export default memo(ProgressCard)
