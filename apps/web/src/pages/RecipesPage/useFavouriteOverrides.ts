import { useCallback, useState } from 'react'
import type { RecipeOut } from '@carrot/shared/types'
import { toggleFavourite } from '../../api/client'

export const useFavouriteOverrides = (
  onRecipeUpdated: (r: RecipeOut) => void
) => {
  const [favouriteOverrides, setFavouriteOverrides] = useState<
    Map<string, boolean>
  >(new Map())

  const clearOverride = useCallback((id: string) => {
    setFavouriteOverrides((prev) => {
      const next = new Map(prev)
      next.delete(id)

      return next
    })
  }, [])

  const handleToggleFavourite = useCallback(
    async (recipe: RecipeOut) => {
      const current = favouriteOverrides.has(recipe.id)
        ? favouriteOverrides.get(recipe.id)!
        : recipe.is_favourite
      setFavouriteOverrides((prev) => new Map(prev).set(recipe.id, !current))
      try {
        const result = await toggleFavourite(recipe.id)
        onRecipeUpdated({ ...recipe, is_favourite: result.is_favourite })
      } catch {
        // swallow — override is cleared below regardless of outcome
      } finally {
        clearOverride(recipe.id)
      }
    },
    [favouriteOverrides, onRecipeUpdated, clearOverride]
  )

  return { favouriteOverrides, handleToggleFavourite }
}
