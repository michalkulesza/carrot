import { memo, useCallback, useMemo, useState } from 'react'
import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { RecipeOut } from '@carrot/shared/types'
import { AppText, Card, Expandable } from '../../components/ui'
import IngredientRow from './IngredientRow'
import type { IngredientGroup, ReadingMetrics } from './helpers'
import { styles } from './styles'
import type { GroceryModeTransition } from './useGroceryRowAnimation'

interface IngredientGroupCardProps {
  recipeId: string
  group: IngredientGroup
  title: string
  recipesById: Map<string, RecipeOut>
  groceryMode: boolean
  modeTransition: GroceryModeTransition
  checkboxesMounted: boolean
  selectedKeys: Set<string>
  onToggleSelected: (key: string) => void
  activeAllergens: string[]
  metrics: ReadingMetrics
  defaultExpanded: boolean
}

const IngredientGroupCard = ({
  recipeId,
  group,
  title,
  recipesById,
  groceryMode,
  modeTransition,
  checkboxesMounted,
  selectedKeys,
  onToggleSelected,
  activeAllergens,
  metrics,
  defaultExpanded,
}: IngredientGroupCardProps) => {
  const { t } = useTranslation()
  const [tooltipOpen, setTooltipOpen] = useState(false)
  const [expanded, setExpanded] = useState(defaultExpanded)

  const cardStyle = useMemo(
    () => [styles.groupCard, !expanded && styles.groupCardCollapsed, tooltipOpen && styles.raised],
    [expanded, tooltipOpen],
  )
  const lastIndex = group.entries.length - 1

  const selectedCount = selectedKeys.size
  const total = group.entries.length
  const countLabel = groceryMode
    ? t('recipes.selectedOfTotal', { selected: selectedCount, total })
    : t('recipes.ingredientsCount', { count: total })
  const toggleLabel = `${title}. ${countLabel}`

  const handleTooltipOpenChange = useCallback((open: boolean) => setTooltipOpen(open), [])
  const handleToggle = useCallback(() => setExpanded((value) => !value), [])

  const header = (
    <View style={styles.groupHeader}>
      <AppText variant="groupTitle" style={styles.groupTitle} numberOfLines={2}>
        {title}
      </AppText>
      <AppText variant="meta" tone="textTertiary" tabular>
        {countLabel}
      </AppText>
    </View>
  )

  return (
    <Card style={cardStyle}>
      <Expandable
        header={header}
        expanded={expanded}
        onToggle={handleToggle}
        accessibilityLabel={toggleLabel}
        unclipWhenExpanded
      >
        <View style={styles.groupBody}>
          {group.entries.map((entry, index) => (
            <IngredientRow
              key={entry.key}
              recipeId={recipeId}
              entry={entry}
              linkedRecipe={entry.linkedRecipeId ? recipesById.get(entry.linkedRecipeId) : undefined}
              isLast={index === lastIndex}
              groceryMode={groceryMode}
              modeTransition={modeTransition}
              checkboxesMounted={checkboxesMounted}
              selected={selectedKeys.has(entry.key)}
              onToggleSelected={onToggleSelected}
              activeAllergens={activeAllergens}
              metrics={metrics}
              onTooltipOpenChange={handleTooltipOpenChange}
            />
          ))}
        </View>
      </Expandable>
    </Card>
  )
}

export default memo(IngredientGroupCard)
