import { useMemo } from 'react'
import { useMyRecipes } from '@carrot/shared/hooks/useRecipes'
import { useHousehold } from '../../context/HouseholdContext'

export const usePersonalRecipesToLink = () => {
  const { activeHouseholdId } = useHousehold()
  const { data: myRecipes = [], isLoading } = useMyRecipes()

  const recipes = useMemo(
    () => (activeHouseholdId ? myRecipes.filter((r) => !r.household_ids.includes(activeHouseholdId)) : []),
    [myRecipes, activeHouseholdId],
  )

  return { recipes, isLoading, activeHouseholdId }
}
