import { memo, useCallback, useMemo } from 'react'
import { Pressable, View } from 'react-native'
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { SymbolView } from 'expo-symbols'
import type { ShoppingCategory } from '@carrot/shared/types'
import { AppText } from '../../components/ui'
import { palette } from '../../theme'
import { styles } from './styles'

interface AisleHeaderRowProps {
  category: ShoppingCategory
  left: number
  total: number
  collapsed: boolean
  progress: SharedValue<number>
  onToggle: (category: ShoppingCategory) => void
}

const OPEN_ROTATION = 180

const AisleHeaderRow = ({ category, left, total, collapsed, progress, onToggle }: AisleHeaderRowProps) => {
  const { t } = useTranslation()

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${(1 - progress.value) * OPEN_ROTATION}deg` }],
  }), [progress])

  const dividerStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }), [progress])

  const title = t(`shoppingList.categories.${category}`)
  const leftLabel = useMemo(() => {
    if (total === 0) return null
    return left > 0 ? t('shoppingList.aisleLeft', { count: left }) : t('shoppingList.aisleAllDone')
  }, [left, total, t])
  const accessibilityLabel = leftLabel ? `${title}, ${leftLabel}` : title
  const accessibilityState = useMemo(() => ({ expanded: !collapsed }), [collapsed])
  const dividerStyles = useMemo(() => [styles.headerDivider, dividerStyle], [dividerStyle])

  const handlePress = useCallback(() => onToggle(category), [category, onToggle])

  return (
    <View style={styles.header}>
      <Pressable
        style={styles.headerRow}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={accessibilityState}
      >
        <AppText variant="groupTitle" style={styles.flex} numberOfLines={1}>{title}</AppText>
        {leftLabel ? <AppText variant="meta" tone="textSecondary" tabular>{leftLabel}</AppText> : null}
        <Animated.View style={chevronStyle}>
          <SymbolView name="chevron.down" size={16} weight="bold" tintColor={palette.textSecondary} />
        </Animated.View>
      </Pressable>
      <Animated.View style={dividerStyles} />
    </View>
  )
}

export default memo(AisleHeaderRow)
