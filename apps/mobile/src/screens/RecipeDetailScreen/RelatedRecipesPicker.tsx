import { memo, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { RecipeOut } from '@carrot/shared/types'
import {
  SELECTION_CHIP_THUMB_SIZE,
  SelectionChip,
  SelectionDrawer,
  SelectionRow,
  useDrawerSearch,
  useRecipeSections,
} from '../../components/SelectionDrawer'
import { Thumbnail } from '../../components/ui'

interface RelatedRecipesPickerProps {
  visible: boolean
  candidates: RecipeOut[]
  selected: Set<string>
  disabled: boolean
  onToggle: (id: string) => void
  onDismiss: () => void
}

const SelectedRecipeChip = ({ recipe, onToggle }: { recipe: RecipeOut; onToggle: (id: string) => void }) => {
  const { t } = useTranslation()

  const handleRemove = useCallback(() => onToggle(recipe.id), [onToggle, recipe.id])

  return (
    <SelectionChip
      label={recipe.title}
      removeLabel={t('relatedRecipes.removeLink', { title: recipe.title })}
      onRemove={handleRemove}
      leading={<Thumbnail url={recipe.thumbnail_url} size={SELECTION_CHIP_THUMB_SIZE} radiusKey="chipThumb" />}
    />
  )
}

const getRecipeKey = (recipe: RecipeOut) => recipe.id

const RelatedRecipesPicker = ({ visible, candidates, selected, disabled, onToggle, onDismiss }: RelatedRecipesPickerProps) => {
  const { t } = useTranslation()
  const { query, setQuery } = useDrawerSearch()

  const sections = useRecipeSections(candidates, query)

  const selectedRecipes = useMemo(() => candidates.filter((recipe) => selected.has(recipe.id)), [candidates, selected])

  const renderItem = useCallback(
    (recipe: RecipeOut) => {
      const timeLabel = recipe.total_time_minutes ? t('browse.minutes', { count: recipe.total_time_minutes }) : undefined

      return (
        <SelectionRow
          id={recipe.id}
          title={recipe.title}
          meta={timeLabel}
          thumbnailUrl={recipe.thumbnail_url}
          selected={selected.has(recipe.id)}
          disabled={disabled}
          onToggle={onToggle}
        />
      )
    },
    [selected, disabled, onToggle, t],
  )

  const chips = useMemo(
    () =>
      selectedRecipes.length > 0
        ? selectedRecipes.map((recipe) => <SelectedRecipeChip key={recipe.id} recipe={recipe} onToggle={onToggle} />)
        : null,
    [selectedRecipes, onToggle],
  )

  const search = useMemo(
    () => ({ value: query, onChange: setQuery, placeholder: t('relatedRecipes.searchPlaceholder') }),
    [query, setQuery, t],
  )

  return (
    <SelectionDrawer<RecipeOut>
      visible={visible}
      onDismiss={onDismiss}
      title={t('relatedRecipes.title')}
      search={search}
      chips={chips}
      sections={sections}
      renderItem={renderItem}
      keyExtractor={getRecipeKey}
      emptyLabel={t('relatedRecipes.noMatches')}
    />
  )
}

export default memo(RelatedRecipesPicker)
