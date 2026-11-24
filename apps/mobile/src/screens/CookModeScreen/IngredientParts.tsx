import { memo, useCallback, useEffect, useMemo } from 'react'
import { LayoutChangeEvent, Pressable, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { Checkbox } from '../../components/ui'
import { scaleTextStyle, type CookIngredient } from './helpers'
import { styles } from './styles'

const CHECK_MS = 180
const CHECKED_OPACITY = 0.45
const QUANTITY_WIDTH = 78

interface GroupHeaderProps {
  title: string
  done: number
  count: number
  first: boolean
}

export const GroupHeader = memo(({ title, done, count, first }: GroupHeaderProps) => {
  const wrapperStyle = useMemo(() => [styles.cardTop, first && styles.cardTopFirst], [first])

  return (
    <View style={wrapperStyle}>
      <View style={styles.groupHeader}>
        <Text style={styles.groupTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.groupCount}>{`${done}/${count}`}</Text>
      </View>
    </View>
  )
})

export const GroupFooter = memo(() => <View style={styles.cardBottom} />)

interface AnchorMarkerProps {
  stepNumber: number
  onLayout: (event: LayoutChangeEvent) => void
}

export const AnchorMarker = memo(({ stepNumber, onLayout }: AnchorMarkerProps) => {
  const { t } = useTranslation()

  return (
    <View style={styles.cardMiddle} onLayout={onLayout}>
      <View style={styles.anchorRow}>
        <View style={styles.anchorBadge}>
          <Text style={styles.anchorBadgeText}>{t('cookMode.stepTitle', { number: stepNumber })}</Text>
        </View>
        <Text style={styles.anchorLabel}>{t('cookMode.aboutHere')}</Text>
        <View style={styles.anchorLine} />
      </View>
    </View>
  )
})

interface IngredientRowProps {
  ingredient: CookIngredient
  checked: boolean
  fontScale: number
  onToggle: (key: string) => void
}

export const IngredientRow = memo(({ ingredient, checked, fontScale, onToggle }: IngredientRowProps) => {
  const reduceMotion = useReducedMotion()
  const dim = useSharedValue(checked ? 1 : 0)

  useEffect(() => {
    dim.value = reduceMotion ? Number(checked) : withTiming(Number(checked), { duration: CHECK_MS })
  }, [checked, dim, reduceMotion])

  const handleToggle = useCallback(() => onToggle(ingredient.key), [onToggle, ingredient.key])

  const textsStyle = useAnimatedStyle(() => ({ opacity: 1 - dim.value * (1 - CHECKED_OPACITY) }))
  const textsStyles = useMemo(() => [styles.ingredientTexts, textsStyle], [textsStyle])
  const quantityStyle = useMemo(
    () => [
      styles.ingredientQuantity,
      scaleTextStyle(styles.ingredientQuantity, fontScale),
      { width: Math.round(QUANTITY_WIDTH * fontScale) },
      checked && styles.struck,
    ],
    [checked, fontScale],
  )
  const nameStyle = useMemo(
    () => [styles.ingredientName, scaleTextStyle(styles.ingredientName, fontScale), checked && styles.struck],
    [checked, fontScale],
  )
  const accessibilityLabel = `${ingredient.quantity} ${ingredient.name}`.trim()

  return (
    <View style={styles.cardMiddle}>
      <Pressable style={styles.ingredientRow} onPress={handleToggle} accessible={false}>
        <Checkbox checked={checked} onToggle={handleToggle} accessibilityLabel={accessibilityLabel} />
        <Animated.View style={textsStyles}>
          <Text style={quantityStyle}>{ingredient.quantity}</Text>
          <Text style={nameStyle}>{ingredient.name}</Text>
        </Animated.View>
      </Pressable>
    </View>
  )
})
