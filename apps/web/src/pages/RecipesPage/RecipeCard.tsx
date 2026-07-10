import { useCallback } from 'react'
import { Star } from 'react-feather'
import { useTranslation } from 'react-i18next'
import type { RecipeOut, Tag } from '@carrot/shared/types'
import { tTag } from '@carrot/shared/utils/tagUtils'
import { proxyUrl } from '../../utils/imageUtils'
import RecipeThumb from './RecipeThumb'
import CardMenu from './CardMenu'

interface RecipeCardProps {
  recipe: RecipeOut
  onView: () => void
  onEdit: () => void
  onDelete: () => void
  onTagClick: (tag: Tag) => void
  onToggleFavourite: () => void
}

const RecipeCard = ({
  recipe,
  onView,
  onEdit,
  onDelete,
  onTagClick,
  onToggleFavourite,
}: RecipeCardProps) => {
  const { t } = useTranslation()
  const thumb = proxyUrl(recipe.thumbnail_url)

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') onView()
    },
    [onView]
  )

  const handleFavouriteAreaClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
  }, [])

  const favouriteLabel = recipe.is_favourite
    ? t('recipes.removeFromFavourites')
    : t('recipes.addToFavourites')

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onView}
      onKeyDown={handleKeyDown}
      className="flex gap-3 items-start p-3 rounded-xl bg-white shadow-sm w-full text-left active:opacity-70 transition-opacity cursor-pointer"
    >
      {thumb && <RecipeThumb src={thumb} alt={recipe.title} />}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm leading-snug line-clamp-2">
          {recipe.title}
        </p>
        {recipe.creator_handle && (
          <p className="text-xs text-zinc-400 mt-0.5">
            @{recipe.creator_handle}
          </p>
        )}
        <div className="flex gap-2 mt-1.5 flex-wrap">
          {recipe.servings != null && (
            <span className="text-xs text-primary font-medium bg-primary/10 px-2 py-0.5 rounded-full">
              {t('recipes.servings', { count: recipe.servings })}
            </span>
          )}
          {recipe.kcal_per_serving != null && (
            <span className="text-xs text-warning-700 font-medium bg-warning/10 px-2 py-0.5 rounded-full">
              {recipe.kcal_per_serving} kcal
            </span>
          )}
          {recipe.protein_per_serving != null && (
            <span className="text-xs text-zinc-600 font-medium bg-zinc-100 px-2 py-0.5 rounded-full">
              {recipe.protein_per_serving}g {t('recipes.protein')}
            </span>
          )}
          {recipe.fat_per_serving != null && (
            <span className="text-xs text-zinc-600 font-medium bg-zinc-100 px-2 py-0.5 rounded-full">
              {recipe.fat_per_serving}g {t('recipes.fat')}
            </span>
          )}
          {recipe.carbs_per_serving != null && (
            <span className="text-xs text-zinc-600 font-medium bg-zinc-100 px-2 py-0.5 rounded-full">
              {recipe.carbs_per_serving}g {t('recipes.carbs')}
            </span>
          )}
        </div>
        {recipe.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {recipe.tags.map((tag) => (
              <RecipeCardTag key={tag.id} tag={tag} onTagClick={onTagClick} />
            ))}
          </div>
        )}
      </div>
      <div
        className="flex items-center gap-1 self-center"
        onClick={handleFavouriteAreaClick}
      >
        <button
          type="button"
          onClick={onToggleFavourite}
          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${recipe.is_favourite ? 'text-amber-400' : 'text-zinc-300 hover:text-amber-400'}`}
          aria-label={favouriteLabel}
        >
          <Star
            size={14}
            fill={recipe.is_favourite ? 'currentColor' : 'none'}
            aria-hidden={true}
          />
        </button>
        <CardMenu onView={onView} onEdit={onEdit} onDelete={onDelete} />
      </div>
    </div>
  )
}

interface RecipeCardTagProps {
  tag: Tag
  onTagClick: (tag: Tag) => void
}

const RecipeCardTag = ({ tag, onTagClick }: RecipeCardTagProps) => {
  const { t } = useTranslation()

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onTagClick(tag)
    },
    [onTagClick, tag]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.stopPropagation()
        onTagClick(tag)
      }
    },
    [onTagClick, tag]
  )

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="text-xs font-medium px-2 py-0.5 rounded-full bg-secondary/15 text-secondary-700 cursor-pointer hover:bg-secondary/25 transition-colors"
    >
      {tTag(tag.name, t)}
    </span>
  )
}

export default RecipeCard
