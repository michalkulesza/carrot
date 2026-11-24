import { memo, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { SaveComponent, ShoppingListItemInput } from '@carrot/shared/types'
import { useRecipes } from '@carrot/shared/hooks/useRecipes'
import { SectionHeader } from '../../components/ui'
import { createShoppingListItemInput } from '../../utils/uuid'
import IngredientGroupCard from './IngredientGroupCard'
import { buildIngredientGroups, capitalizeFirst, getReadingMetrics, type IngredientEntry, type IngredientGroup } from './helpers'

interface IngredientsSectionProps {
  recipeId: string
  components: SaveComponent[]
  unitSystem: string
  servingScale: number
  addMode: boolean
  sessionAdded: Set<string>
  onAdd: (key: string, item: ShoppingListItemInput) => void
  onAddAll: (keys: string[], items: ShoppingListItemInput[]) => void
  activeAllergens: string[]
  fontSizeIndex: number
}

const SECTION_TOP_GAP = 32
const ALL_GROUP_KEY = 'group-all'

const IngredientsSection = ({
  recipeId,
  components,
  unitSystem,
  servingScale,
  addMode,
  sessionAdded,
  onAdd,
  onAddAll,
  activeAllergens,
  fontSizeIndex,
}: IngredientsSectionProps) => {
  const { t } = useTranslation()
  const { recipes } = useRecipes(false)

  const cupUnit = t('units.cup', { defaultValue: 'cup' })
  const groups = useMemo(
    () => buildIngredientGroups(components, unitSystem, servingScale, cupUnit),
    [components, unitSystem, servingScale, cupUnit],
  )
  const entries = useMemo(() => groups.flatMap((group) => group.entries), [groups])
  const displayGroups = useMemo(
    () => (groups.length > 1 ? [{ key: ALL_GROUP_KEY, name: null, entries }, ...groups] : groups),
    [groups, entries],
  )
  const recipesById = useMemo(() => new Map(recipes.map((recipe) => [recipe.id, recipe])), [recipes])
  const metrics = useMemo(() => getReadingMetrics(fontSizeIndex), [fontSizeIndex])

  const allAdded = entries.length > 0 && entries.every((entry) => sessionAdded.has(entry.key))

  const handleAddAll = useCallback(() => {
    const pending = entries.filter((entry) => !sessionAdded.has(entry.key))
    if (pending.length === 0) return

    onAddAll(
      pending.map((entry) => entry.key),
      pending.map((entry) => createShoppingListItemInput(entry.shoppingListValue, entry.shoppingCategory)),
    )
  }, [entries, onAddAll, sessionAdded])

  const handleAddEntry = useCallback(
    (key: string, shoppingListValue: string, shoppingCategory: IngredientEntry['shoppingCategory']) =>
      onAdd(key, createShoppingListItemInput(shoppingListValue, shoppingCategory)),
    [onAdd],
  )

  if (groups.length === 0) return null

  const fallbackTitle = t('recipes.sectionIngredients')
  const allTitle = t('recipes.allIngredients')
  const getGroupTitle = (group: IngredientGroup) => {
    if (group.key === ALL_GROUP_KEY) return allTitle

    return group.name ? capitalizeFirst(group.name) : fallbackTitle
  }

  return (
    <>
      <SectionHeader
        title={fallbackTitle}
        topGap={SECTION_TOP_GAP}
        actionLabel={allAdded ? t('shoppingList.addedToList') : t('recipes.addAllToList')}
        actionDisabled={allAdded}
        onAction={handleAddAll}
      />
      {displayGroups.map((group) => (
        <IngredientGroupCard
          key={group.key}
          recipeId={recipeId}
          group={group}
          title={getGroupTitle(group)}
          defaultExpanded={group.key !== ALL_GROUP_KEY}
          recipesById={recipesById}
          addMode={addMode}
          sessionAdded={sessionAdded}
          onAdd={handleAddEntry}
          activeAllergens={activeAllergens}
          metrics={metrics}
        />
      ))}
    </>
  )
}

export default memo(IngredientsSection)
