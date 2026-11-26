import { useDeferredValue, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { RecipeOut } from '@carrot/shared/types'
import type { DrawerSection } from './types'

const RECENT_LIMIT = 5

type GroupKey = 'favourites' | 'recent' | 'all'

const GROUP_TITLE_KEYS: Record<GroupKey, string> = {
  favourites: 'home.favourites',
  recent: 'home.recentlyAdded',
  all: 'selectionDrawer.allRecipes',
}

const groupRecipes = (recipes: RecipeOut[], excludeId?: string): [GroupKey, RecipeOut[]][] => {
  const available = recipes.filter((recipe) => recipe.id !== excludeId)

  const favourites = available.filter((recipe) => recipe.is_favourite)
  const recent = available
    .filter((recipe) => !recipe.is_favourite)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, RECENT_LIMIT)
  const shown = new Set([...favourites, ...recent].map((recipe) => recipe.id))
  const rest = available.filter((recipe) => !shown.has(recipe.id)).sort((a, b) => a.title.localeCompare(b.title))

  return [
    ['favourites', favourites],
    ['recent', recent],
    ['all', rest],
  ]
}

export const useRecipeSections = (
  recipes: RecipeOut[],
  query: string,
  excludeId?: string,
): DrawerSection<RecipeOut>[] => {
  const { t } = useTranslation()
  // Filtering trails the keystrokes so typing never waits on the list re-render.
  const deferredQuery = useDeferredValue(query)

  const groups = useMemo(() => groupRecipes(recipes, excludeId), [recipes, excludeId])

  return useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    const matches = (recipe: RecipeOut) => !q || recipe.title.toLowerCase().includes(q)

    return groups
      .map(([key, data]) => ({ key, title: t(GROUP_TITLE_KEYS[key]), data: q ? data.filter(matches) : data }))
      .filter((section) => section.data.length > 0)
  }, [groups, deferredQuery, t])
}
