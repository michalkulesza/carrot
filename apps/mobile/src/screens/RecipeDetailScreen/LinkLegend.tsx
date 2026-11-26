import { memo } from 'react'
import Animated from 'react-native-reanimated'
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { LINK_LEGEND_ICON_SIZE } from './ingredientRowLayout'
import LinkIcon from './LinkIcon'
import { styles } from './styles'
import { useGroceryLegendStyles, type GroceryModeTransition } from './useGroceryRowAnimation'

interface LinkLegendProps {
  hasLinks: boolean
  groceryMode: boolean
  transition: GroceryModeTransition
  selectedCount: number
  total: number
}

const LinkLegend = ({ hasLinks, groceryMode, transition, selectedCount, total }: LinkLegendProps) => {
  const { t } = useTranslation()
  const { legendStyle, countStyle } = useGroceryLegendStyles(transition)

  const countLabel = t('recipes.grocerySelectionCount', { selected: selectedCount, total })

  return (
    <View style={styles.linkLegendSlot}>
      <Animated.View
        style={[styles.linkLegend, legendStyle]}
        pointerEvents="none"
        accessibilityElementsHidden={groceryMode || !hasLinks}
        importantForAccessibility={groceryMode || !hasLinks ? 'no-hide-descendants' : 'auto'}
      >
        {hasLinks ? (
          <>
            <View style={styles.linkLegendItem}>
              <LinkIcon isExternal size={LINK_LEGEND_ICON_SIZE} />
              <Text style={styles.linkLegendLabel} numberOfLines={1}>
                {t('recipes.linkLegendWeb')}
              </Text>
            </View>
            <View style={styles.linkLegendItem}>
              <LinkIcon isExternal={false} size={LINK_LEGEND_ICON_SIZE} />
              <Text style={styles.linkLegendLabel} numberOfLines={1}>
                {t('recipes.linkLegendRecipe')}
              </Text>
            </View>
          </>
        ) : null}
      </Animated.View>
      <Animated.View
        style={[styles.grocerySelectionCount, countStyle]}
        pointerEvents="none"
        accessibilityElementsHidden={!groceryMode}
        importantForAccessibility={groceryMode ? 'auto' : 'no-hide-descendants'}
      >
        <Text style={styles.grocerySelectionCountText} numberOfLines={1} accessibilityLabel={countLabel}>
          {countLabel}
        </Text>
      </Animated.View>
    </View>
  )
}

export default memo(LinkLegend)
