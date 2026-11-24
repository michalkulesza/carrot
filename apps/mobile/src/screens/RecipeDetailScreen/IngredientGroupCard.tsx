import { memo, useCallback, useMemo, useState } from 'react'
import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { RecipeOut } from '@carrot/shared/types'
import { AppText, Card, Expandable } from '../../components/ui'
import IngredientRow from './IngredientRow'
import type { IngredientEntry, IngredientGroup, ReadingMetrics } from './helpers'
import { styles } from './styles'

interface IngredientGroupCardProps {
  recipeId: string
  group: IngredientGroup
  title: string
  recipesById: Map<string, RecipeOut>
  addMode: boolean
  sessionAdded: Set<string>
  onAdd: (key: string, shoppingListValue: string, shoppingCategory: IngredientEntry['shoppingCategory']) => void
  activeAllergens: string[]
  metrics: ReadingMetrics
  defaultExpanded: boolean
}

const IngredientGroupCard = ({
  recipeId,
  group,
  title,
  recipesById,
  addMode,
  sessionAdded,
  onAdd,
  activeAllergens,
  metrics,
  defaultExpanded,
}: IngredientGroupCardProps) => {
  const { t } = useTranslation()
  const [tooltipOpen, setTooltipOpen] = useState(false)
  const [expanded, setExpanded] = useState(defaultExpanded)

  const cardStyle = useMemo(() => [styles.groupCard, tooltipOpen && styles.raised], [tooltipOpen])
  const lastIndex = group.entries.length - 1

  const countLabel = t('recipes.ingredientsCount', { count: group.entries.length })
  const toggleLabel = `${title}. ${countLabel}`

  const handleTooltipOpenChange = useCallback((open: boolean) => setTooltipOpen(open), [])
  const handleToggle = useCallback(() => setExpanded((value) => !value), [])

  const header = (
    <View style={styles.groupHeader}>
      <AppText variant="groupTitle" style={styles.groupTitle} numberOfLines={2}>
        {title}
      </AppText>
      <AppText variant="meta" tone="textTertiary">
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
              addMode={addMode}
              isAdded={sessionAdded.has(entry.key)}
              onAdd={onAdd}
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
