import type { RecipeOut } from '@carrot/shared/types'
import { proxyUrl } from '../../utils/imageUtils'
import NetworkImage from '../../components/NetworkImage'

interface SearchResultItemProps {
  recipe: RecipeOut
  matchedIngredient?: string
  onClick: () => void
}

const SearchResultItem = ({
  recipe,
  matchedIngredient,
  onClick,
}: SearchResultItemProps) => {
  const thumb = proxyUrl(recipe.thumbnail_url)

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-3 w-full text-left cursor-pointer hover:bg-zinc-50 transition-colors border-b border-zinc-100 last:border-b-0"
    >
      {thumb ? (
        <NetworkImage
          src={thumb}
          alt=""
          className="w-10 h-10 rounded-lg shrink-0"
        />
      ) : (
        <div className="w-10 h-10 rounded-lg bg-zinc-100 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{recipe.title}</p>
        {matchedIngredient && (
          <p className="text-xs text-zinc-400 truncate mt-0.5">
            {matchedIngredient}
          </p>
        )}
      </div>
    </button>
  )
}

export default SearchResultItem
