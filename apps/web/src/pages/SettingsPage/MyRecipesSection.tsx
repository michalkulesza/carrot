import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import type { HouseholdOut, RecipeOut } from '@carrot/shared/types'
import { useMyRecipes } from '@carrot/shared/hooks/useRecipes'
import MyRecipeRow from './MyRecipeRow'
import { useRouteNavigation } from '../../routing/RouteNavigationContext'

interface MyRecipesSectionProps {
  households: HouseholdOut[]
  activeHouseholdId: string | null
}

const DEFAULT_VISIBLE_COUNT = 2

const MyRecipesSection = ({
  households,
  activeHouseholdId,
}: MyRecipesSectionProps) => {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { data: myRecipes = [] } = useMyRecipes()
  const { openRecipe } = useRouteNavigation()
  const [expanded, setExpanded] = useState(false)

  const invalidateMyRecipes = useCallback(
    () => qc.invalidateQueries({ queryKey: ['recipes', 'mine'] }),
    [qc]
  )

  const handleView = useCallback((id: string) => openRecipe(id), [openRecipe])

  const handleDeleted = useCallback(
    (id: string) => {
      qc.setQueryData<RecipeOut[]>(['recipes', 'mine'], (old = []) =>
        old.filter((r) => r.id !== id)
      )
      invalidateMyRecipes()
    },
    [qc, invalidateMyRecipes]
  )

  const handleUpdated = useCallback(
    (updated: RecipeOut) => {
      qc.setQueryData<RecipeOut[]>(['recipes', 'mine'], (old = []) =>
        old.map((r) => (r.id === updated.id ? updated : r))
      )
    },
    [qc]
  )

  const handleToggleExpanded = useCallback(() => setExpanded((v) => !v), [])
  const hasMoreThanDefault = myRecipes.length > DEFAULT_VISIBLE_COUNT
  const visibleRecipes = expanded
    ? myRecipes
    : myRecipes.slice(0, DEFAULT_VISIBLE_COUNT)

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {t('settings.myRecipes')}
      </h2>

      {myRecipes.length === 0 ? (
        <p className="text-sm text-zinc-400">{t('settings.myRecipesEmpty')}</p>
      ) : (
        <>
          <ul
            className={`flex flex-col gap-2 ${expanded ? 'max-h-96 overflow-y-auto pr-1' : ''}`}
          >
            {visibleRecipes.map((recipe: RecipeOut) => (
              <MyRecipeRow
                key={recipe.id}
                recipe={recipe}
                households={households}
                activeHouseholdId={activeHouseholdId}
                onView={handleView}
                onDeleted={handleDeleted}
                onUpdated={handleUpdated}
              />
            ))}
          </ul>

          {hasMoreThanDefault && (
            <button
              type="button"
              onClick={handleToggleExpanded}
              className="self-start text-sm font-medium text-primary hover:underline"
            >
              {expanded ? t('common.showLess') : t('common.showMore')}
            </button>
          )}
        </>
      )}
    </section>
  )
}

export default MyRecipesSection
