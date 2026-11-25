import { memo, useCallback, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { MealPlanEntry, RecipeOut } from '@carrot/shared/types'
import {
  QuickAddRow,
  SELECTION_CHIP_THUMB_SIZE,
  SelectionChip,
  SelectionDrawer,
  SelectionRow,
  useRecipeSections,
} from '../../components/SelectionDrawer'
import { Thumbnail } from '../../components/ui'
import { formatRecipeMeta } from '@carrot/shared/utils/recipeMeta'
import { QuickMealThumb } from './DishThumb'
import { formatDayMonth, formatWeekdayLong } from './helpers'
import { getSelectionKey, useDishDrawer, type DishSelection } from './useDishDrawer'

const QUICK_CHIP_GLYPH_SIZE = 13

const getRecipeKey = (recipe: RecipeOut) => recipe.id

const shortenTitle = (title: string) => title.split(/\s+/).slice(0, 2).join(' ')

interface DishChipProps {
  item: DishSelection
  recipe: RecipeOut | undefined
  onRemove: (key: string) => void
}

const DishChip = ({ item, recipe, onRemove }: DishChipProps) => {
  const { t } = useTranslation()

  const key = getSelectionKey(item)
  const title = item.kind === 'recipe' ? (recipe?.title ?? '') : item.text
  const handleRemove = useCallback(() => onRemove(key), [onRemove, key])

  const leading =
    item.kind === 'recipe' ? (
      <Thumbnail url={recipe?.thumbnail_url ?? null} size={SELECTION_CHIP_THUMB_SIZE} radiusKey="chipThumb" />
    ) : (
      <QuickMealThumb
        size={SELECTION_CHIP_THUMB_SIZE}
        glyphSize={QUICK_CHIP_GLYPH_SIZE}
        radiusKey="chipThumb"
        tone="plain"
      />
    )

  return (
    <SelectionChip
      label={item.kind === 'recipe' ? shortenTitle(title) : title}
      removeLabel={t('mealPlan.removeDishChip', { title })}
      onRemove={handleRemove}
      leading={leading}
    />
  )
}

interface DishDrawerProps {
  dateIso: string | null
  existingEntries: MealPlanEntry[]
  onClose: () => void
}

const DishDrawer = ({ dateIso, existingEntries, onClose }: DishDrawerProps) => {
  const { t, i18n } = useTranslation()
  const {
    recipes,
    recipesById,
    query,
    setQuery,
    selection,
    selectedRecipeIds,
    existingRecipeIds,
    showQuickAdd,
    trimmedQuery,
    saving,
    handleDismiss,
    toggleRecipe,
    addQuickMeal,
    removeItem,
    submit,
  } = useDishDrawer(dateIso, existingEntries, onClose)
  const lastDateRef = useRef(dateIso)

  if (dateIso) lastDateRef.current = dateIso

  const locale = i18n.language
  const shownDate = dateIso ?? lastDateRef.current
  const sections = useRecipeSections(recipes, query)

  const title = shownDate ? t('mealPlan.addToDay', { day: formatWeekdayLong(shownDate, locale) }) : ''
  const subtitle = shownDate ? formatDayMonth(shownDate, locale) : undefined

  const renderItem = useCallback(
    (recipe: RecipeOut) => (
      <SelectionRow
        id={recipe.id}
        title={recipe.title}
        meta={existingRecipeIds.has(recipe.id) ? t('mealPlan.alreadyOnDay') : formatRecipeMeta(recipe, t)}
        thumbnailUrl={recipe.thumbnail_url}
        selected={selectedRecipeIds.has(recipe.id)}
        onToggle={toggleRecipe}
      />
    ),
    [existingRecipeIds, selectedRecipeIds, toggleRecipe, t],
  )

  const chips = useMemo(
    () =>
      selection.length > 0
        ? selection.map((item) => (
            <DishChip
              key={getSelectionKey(item)}
              item={item}
              recipe={item.kind === 'recipe' ? recipesById.get(item.id) : undefined}
              onRemove={removeItem}
            />
          ))
        : null,
    [selection, recipesById, removeItem],
  )

  const listHeader = useMemo(
    () =>
      showQuickAdd ? (
        <QuickAddRow
          title={t('mealPlan.addQuickMeal', { text: trimmedQuery })}
          meta={t('mealPlan.quickMealHint')}
          accessibilityLabel={t('mealPlan.addQuickMeal', { text: trimmedQuery })}
          onPress={addQuickMeal}
        />
      ) : null,
    [showQuickAdd, trimmedQuery, addQuickMeal, t],
  )

  const search = useMemo(
    () => ({ value: query, onChange: setQuery, placeholder: t('mealPlan.dishSearchPlaceholder') }),
    [query, setQuery, t],
  )

  const action = useMemo(
    () => (selection.length > 0 ? { label: t('common.add'), onPress: submit, disabled: saving } : undefined),
    [selection.length, saving, submit, t],
  )

  const emptyKey = recipes.length === 0 && !query ? 'mealPlan.noRecipesYet' : 'mealPlan.noRecipesMatch'
  const emptyLabel = showQuickAdd ? null : t(emptyKey)

  return (
    <SelectionDrawer<RecipeOut>
      visible={dateIso !== null}
      onDismiss={handleDismiss}
      title={title}
      subtitle={subtitle}
      countLabel={t('selectionDrawer.selectedCount', { count: selection.length })}
      action={action}
      search={search}
      chips={chips}
      listHeader={listHeader}
      sections={sections}
      renderItem={renderItem}
      keyExtractor={getRecipeKey}
      emptyLabel={emptyLabel}
    />
  )
}

export default memo(DishDrawer)
