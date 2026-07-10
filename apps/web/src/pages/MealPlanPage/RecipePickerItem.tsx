import type { RecipeOut } from '@carrot/shared/types'
import { proxyUrl } from '../../utils/imageUtils'
import RecipeThumb from './RecipeThumb'

interface RecipePickerItemProps {
  recipe: RecipeOut
  disabled: boolean
  onSelect: () => void
}

const RecipePickerItem = ({
  recipe,
  disabled,
  onSelect,
}: RecipePickerItemProps) => {
  const thumb = proxyUrl(recipe.thumbnail_url)

  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className="flex items-center gap-3 px-4 py-3 w-full text-left border-b border-zinc-200 last:border-0 active:bg-zinc-100 transition-colors disabled:opacity-50"
    >
      {thumb ? (
        <RecipeThumb
          src={thumb}
          alt={recipe.title}
          className="w-12 h-12 rounded-xl shrink-0"
        />
      ) : (
        <div className="w-12 h-12 rounded-xl bg-zinc-100 shrink-0 flex items-center justify-center text-xl">
          🍽
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold line-clamp-2 leading-snug">
          {recipe.title}
        </p>
        <div className="flex gap-2 mt-0.5">
          {recipe.kcal_per_serving != null && (
            <span className="text-xs text-zinc-400">
              {recipe.kcal_per_serving} kcal
            </span>
          )}
          {recipe.protein_per_serving != null && (
            <span className="text-xs text-zinc-400">
              {recipe.protein_per_serving}g P
            </span>
          )}
          {recipe.fat_per_serving != null && (
            <span className="text-xs text-zinc-400">
              {recipe.fat_per_serving}g F
            </span>
          )}
          {recipe.carbs_per_serving != null && (
            <span className="text-xs text-zinc-400">
              {recipe.carbs_per_serving}g C
            </span>
          )}
          {recipe.creator_handle && (
            <span className="text-xs text-zinc-400">
              @{recipe.creator_handle}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

export default RecipePickerItem
