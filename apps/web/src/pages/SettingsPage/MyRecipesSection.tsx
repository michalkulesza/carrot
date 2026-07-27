import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import type { HouseholdOut, RecipeOut, Tag } from '@carrot/shared/types'
import { useMyRecipes } from '@carrot/shared/hooks/useRecipes'
import { useTags } from '@carrot/shared/hooks/useTags'
import RecipeDetailModal from '../../components/RecipeDetailModal'
import MyRecipeRow from './MyRecipeRow'

interface MyRecipesSectionProps {
  households: HouseholdOut[]
  activeHouseholdId: string | null
}

const MyRecipesSection = ({
  households,
  activeHouseholdId,
}: MyRecipesSectionProps) => {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { data: myRecipes = [] } = useMyRecipes()
  const { tags: allTags } = useTags()
  const [openRecipeId, setOpenRecipeId] = useState<string | null>(null)

  const invalidateMyRecipes = useCallback(
    () => qc.invalidateQueries({ queryKey: ['recipes', 'mine'] }),
    [qc]
  )

  const handleView = useCallback((id: string) => setOpenRecipeId(id), [])
  const handleCloseDetail = useCallback(() => setOpenRecipeId(null), [])

  const handleDeleted = useCallback(
    (id: string) => {
      qc.setQueryData<RecipeOut[]>(['recipes', 'mine'], (old = []) =>
        old.filter((r) => r.id !== id)
      )
      setOpenRecipeId((current) => (current === id ? null : current))
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

  const openRecipe: RecipeOut | null =
    myRecipes.find((r) => r.id === openRecipeId) ?? null

  if (myRecipes.length === 0) return null

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {t('settings.myRecipes')}
      </h2>
      <ul className="flex flex-col gap-2">
        {myRecipes.map((recipe: RecipeOut) => (
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

      <RecipeDetailModal
        recipe={openRecipe}
        allTags={allTags as Tag[]}
        onClose={handleCloseDetail}
        onUpdated={handleUpdated}
        onDeleted={handleDeleted}
      />
    </section>
  )
}

export default MyRecipesSection
