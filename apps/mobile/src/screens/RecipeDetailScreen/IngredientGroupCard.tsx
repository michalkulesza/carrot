import { memo, useCallback, useMemo, useState } from 'react'
import { View } from 'react-native'
import type { RecipeOut } from '@carrot/shared/types'
import { useTranslation } from 'react-i18next'
import { AppText, Card, Expandable } from '../../components/ui'
import type { IngredientSwapState } from './IngredientSwapContext'
import IngredientRow from './IngredientRow'
import type { IngredientGroup, ReadingMetrics } from './helpers'
import { styles } from './styles'
import type { GroceryModeTransition } from './useGroceryRowAnimation'

interface IngredientGroupCardProps {
  group: IngredientGroup
  title: string
  groceryMode: boolean
  modeTransition: GroceryModeTransition
  selectedKeys: Set<string>
  onToggleSelected: (key: string) => void
  activeAllergens: string[]
  metrics: ReadingMetrics
  defaultExpanded: boolean
  recipesById: Map<string, RecipeOut>
  swapState: IngredientSwapState
}

const IngredientGroupCard = ({
  group,
  title,
  groceryMode,
  modeTransition,
  selectedKeys,
  onToggleSelected,
  activeAllergens,
  metrics,
  defaultExpanded,
  recipesById,
  swapState,
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
              entry={entry}
              linkedRecipeTitle={entry.linkedRecipeId ? recipesById.get(entry.linkedRecipeId)?.title : undefined}
              highlighted={swapState.targetKey === entry.key}
              rewrite={swapState.rewrites.get(entry.key)}
              swapBusy={swapState.busy}
              isLast={index === lastIndex}
              groceryMode={groceryMode}
              modeTransition={modeTransition}
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
