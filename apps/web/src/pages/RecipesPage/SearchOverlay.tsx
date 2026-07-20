import { useTranslation } from 'react-i18next'
import type { RecipeOut } from '@carrot/shared/types'
import type { IngredientMatch } from './helpers'
import SearchResultItem from './SearchResultItem'

interface SearchOverlayProps {
  titleMatches: RecipeOut[]
  ingredientMatches: IngredientMatch[]
  semanticMatches: RecipeOut[]
  onSelectRecipe: (recipe: RecipeOut) => void
}

const SearchOverlay = ({
  titleMatches,
  ingredientMatches,
  semanticMatches,
  onSelectRecipe,
}: SearchOverlayProps) => {
  const { t } = useTranslation()
  const hasResults = titleMatches.length > 0 || ingredientMatches.length > 0 || semanticMatches.length > 0

  return (
    <div className="absolute left-2 right-2 top-2 z-40 bg-white rounded-xl shadow-xl border border-zinc-200 overflow-hidden">
      <div className="max-h-[60vh] overflow-y-auto">
        {!hasResults ? (
          <p className="px-4 py-8 text-sm text-zinc-400 text-center">
            {t('recipes.noResults')}
          </p>
        ) : (
          <>
            {titleMatches.length > 0 && (
              <>
                <div className="px-4 py-2 bg-zinc-50 border-b border-zinc-100">
                  <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide">
                    {t('recipes.sectionRecipes')}
                  </span>
                </div>
                {titleMatches.map((r) => (
                  <SearchResultItem
                    key={r.id}
                    recipe={r}
                    onClick={() => onSelectRecipe(r)}
                  />
                ))}
              </>
            )}
            {ingredientMatches.length > 0 && (
              <>
                <div className="px-4 py-2 bg-zinc-50 border-b border-zinc-100">
                  <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide">
                    {t('recipes.sectionIngredients')}
                  </span>
                </div>
                {ingredientMatches.map(({ recipe, matchedIngredient }) => (
                  <SearchResultItem
                    key={recipe.id}
                    recipe={recipe}
                    matchedIngredient={matchedIngredient}
                    onClick={() => onSelectRecipe(recipe)}
                  />
                ))}
              </>
            )}
            {semanticMatches.length > 0 && (
              <>
                <div className="px-4 py-2 bg-zinc-50 border-b border-zinc-100">
                  <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide">
                    {t('recipes.sectionSuggested')}
                  </span>
                </div>
                {semanticMatches.map((recipe) => (
                  <SearchResultItem key={recipe.id} recipe={recipe} onClick={() => onSelectRecipe(recipe)} />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default SearchOverlay
