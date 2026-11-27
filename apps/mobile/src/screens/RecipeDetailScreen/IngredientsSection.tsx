import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useRecipes } from '@carrot/shared/hooks/useRecipes'
import { SectionHeader } from '../../components/ui'
import FadeSection from './FadeSection'
import HeaderPillButton from './HeaderPillButton'
import IngredientGroupCard from './IngredientGroupCard'
import type { IngredientSwapState } from './IngredientSwapContext'
import LinkLegend from './LinkLegend'
import { capitalizeFirst, getReadingMetrics, type IngredientEntry, type IngredientGroup } from './helpers'
import { useGroceryModeTransition } from './useGroceryRowAnimation'
import { useGroupSelections } from './useGroupSelections'

interface IngredientsSectionProps {
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
  swapState: IngredientSwapState
  selectedCount: number
  contentReady: boolean
  stagedMount: boolean
}

const SECTION_TOP_GAP = 32
const ALL_GROUP_KEY = 'group-all'
const EMPTY_SELECTION = new Set<string>()

const IngredientsSection = ({
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
  swapState,
  selectedCount,
  contentReady,
  stagedMount,
}: IngredientsSectionProps) => {
  const { t } = useTranslation()

  const { recipes } = useRecipes(false)
  const recipesById = useMemo(() => new Map(recipes.map((recipe) => [recipe.id, recipe])), [recipes])
  const hasLinks = useMemo(() => entries.some((entry) => Boolean(entry.linkedRecipeUrl)), [entries])

  const displayGroups = useMemo(
    () => (groups.length > 1 ? [{ key: ALL_GROUP_KEY, name: null, entries }, ...groups] : groups),
    [groups, entries],
  )
  const groupSelections = useGroupSelections(displayGroups, selectedKeys)
  const transition = useGroceryModeTransition(groceryMode)
  const metrics = useMemo(() => getReadingMetrics(fontSizeIndex), [fontSizeIndex])

  const firstFrameGroupCount = groups.length > 1 ? 2 : 1

  if (groups.length === 0) return null

  const fallbackTitle = t('recipes.sectionIngredients')
  const allTitle = t('recipes.allIngredients')
  const getGroupTitle = (group: IngredientGroup) => {
    if (group.key === ALL_GROUP_KEY) return allTitle

    return group.name ? capitalizeFirst(group.name) : fallbackTitle
  }

  const renderGroup = (group: IngredientGroup) => (
    <IngredientGroupCard
      key={group.key}
      recipesById={recipesById}
      group={group}
      title={getGroupTitle(group)}
      defaultExpanded={group.key !== ALL_GROUP_KEY}
      lazyBody={group.key === ALL_GROUP_KEY}
      groceryMode={groceryMode}
      modeTransition={transition}
      selectedKeys={groupSelections.get(group.key) ?? EMPTY_SELECTION}
      onToggleSelected={onToggleSelected}
      activeAllergens={activeAllergens}
      metrics={metrics}
      swapState={swapState}
    />
  )

  const firstFrameGroupCards = displayGroups.slice(0, firstFrameGroupCount).map(renderGroup)
  const deferredGroupCards = contentReady ? displayGroups.slice(firstFrameGroupCount).map(renderGroup) : null
  const deferredGroupsContent =
    stagedMount && deferredGroupCards ? <FadeSection>{deferredGroupCards}</FadeSection> : deferredGroupCards

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
      <LinkLegend
        hasLinks={hasLinks}
        groceryMode={groceryMode}
        transition={transition}
        selectedCount={selectedCount}
        total={entries.length}
      />
      {firstFrameGroupCards}
      {deferredGroupsContent}
    </>
  )
}

export default memo(IngredientsSection)
