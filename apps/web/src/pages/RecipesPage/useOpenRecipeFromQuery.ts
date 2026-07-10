import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { SetURLSearchParams } from 'react-router-dom'
import type { RecipeOut } from '@carrot/shared/types'

export interface StepLocation {
  componentIndex: number
  stepIndex: number
}

interface UseOpenRecipeFromQueryArgs {
  recipes: RecipeOut[]
  loading: boolean
  searchParams: URLSearchParams
  setSearchParams: SetURLSearchParams
  setSelected: Dispatch<SetStateAction<RecipeOut | null>>
  setOpenInEdit: Dispatch<SetStateAction<boolean>>
  setScrollToStep: Dispatch<SetStateAction<StepLocation | null>>
}

export const useOpenRecipeFromQuery = ({
  recipes,
  loading,
  searchParams,
  setSearchParams,
  setSelected,
  setOpenInEdit,
  setScrollToStep,
}: UseOpenRecipeFromQueryArgs) => {
  useEffect(() => {
    const recipeId = searchParams.get('recipe')
    if (!recipeId || loading) return
    const recipe = recipes.find((r) => r.id === recipeId)
    if (!recipe) return
    const stepParam = searchParams.get('step')
    if (stepParam) {
      const [componentIndex, stepIndex] = stepParam.split('-').map(Number)
      if (!Number.isNaN(componentIndex) && !Number.isNaN(stepIndex)) {
        setScrollToStep({ componentIndex, stepIndex })
      }
    }
    setOpenInEdit(false)
    setSelected(recipe)
    setSearchParams(new URLSearchParams(), { replace: true })
  }, [
    searchParams,
    recipes,
    loading,
    setSearchParams,
    setSelected,
    setOpenInEdit,
    setScrollToStep,
  ])
}
