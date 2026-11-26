import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useRecipes } from '@carrot/shared/hooks/useRecipes'
import { SectionHeader } from '../../components/ui'
import HeaderPillButton from './HeaderPillButton'
import IngredientGroupCard from './IngredientGroupCard'
import { capitalizeFirst, getReadingMetrics, type IngredientEntry, type IngredientGroup } from './helpers'
import { useGroceryModeTransition } from './useGroceryRowAnimation'
import { useGroupSelections } from './useGroupSelections'

interface IngredientsSectionProps {
  recipeId: string
  groups: IngredientGroup[]
  entries: IngredientEntry[]
  groceryMode: boolean
  selectedKeys: Set<string>
  allSelected: boolean
  onToggleSelected: (key: string) => void
  onToggleAll: () => void
  onEnterGroceryMode: () => void
  activeAllergens: string[]
  fontSizeIndex: number
}

const SECTION_TOP_GAP = 32
const ALL_GROUP_KEY = 'group-all'
const EMPTY_SELECTION = new Set<string>()

const IngredientsSection = ({
  recipeId,
  groups,
  entries,
  groceryMode,
  selectedKeys,
  allSelected,
  onToggleSelected,
  onToggleAll,
  onEnterGroceryMode,
  activeAllergens,
  fontSizeIndex,
}: IngredientsSectionProps) => {
  const { t } = useTranslation()
  const { recipes } = useRecipes(false)

  const displayGroups = useMemo(
    () => (groups.length > 1 ? [{ key: ALL_GROUP_KEY, name: null, entries }, ...groups] : groups),
    [groups, entries],
  )
  const groupSelections = useGroupSelections(displayGroups, selectedKeys)
  const { transition, checkboxesMounted } = useGroceryModeTransition(groceryMode)
  const recipesById = useMemo(() => new Map(recipes.map((recipe) => [recipe.id, recipe])), [recipes])
  const metrics = useMemo(() => getReadingMetrics(fontSizeIndex), [fontSizeIndex])

  if (groups.length === 0) return null

  const fallbackTitle = t('recipes.sectionIngredients')
  const allTitle = t('recipes.allIngredients')
  const getGroupTitle = (group: IngredientGroup) => {
    if (group.key === ALL_GROUP_KEY) return allTitle

    return group.name ? capitalizeFirst(group.name) : fallbackTitle
  }

  const selectAllLabel = allSelected ? t('recipes.selectNone') : t('recipes.selectAll')
  const headerAction = groceryMode ? (
    <HeaderPillButton tone="neutral" label={selectAllLabel} onPress={onToggleAll} />
  ) : (
    <HeaderPillButton tone="tint" icon="cart" label={t('recipes.addToShoppingList')} onPress={onEnterGroceryMode} />
  )

  return (
    <>
      <SectionHeader
        title={fallbackTitle}
        topGap={SECTION_TOP_GAP}
        action={headerAction}
      />
      {displayGroups.map((group) => (
        <IngredientGroupCard
          key={group.key}
          recipeId={recipeId}
          group={group}
          title={getGroupTitle(group)}
          defaultExpanded={group.key !== ALL_GROUP_KEY}
          recipesById={recipesById}
          groceryMode={groceryMode}
          modeTransition={transition}
          checkboxesMounted={checkboxesMounted}
          selectedKeys={groupSelections.get(group.key) ?? EMPTY_SELECTION}
          onToggleSelected={onToggleSelected}
          activeAllergens={activeAllergens}
          metrics={metrics}
        />
      ))}
    </>
  )
}

export default memo(IngredientsSection)
