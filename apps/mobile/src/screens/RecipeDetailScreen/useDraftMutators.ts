import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { ShoppingCategory } from '@carrot/shared/types'
import { serializeIngredient, type StructuredIngredient } from '@carrot/shared/utils/ingredientUtils'
import type { EditComponent, EditDraft, NutritionField } from './helpers'

export const useDraftMutators = (setDraft: Dispatch<SetStateAction<EditDraft | null>>) => {
  const updateComp = useCallback((ci: number, patch: Partial<EditComponent>) => {
    setDraft((prev) => prev && { ...prev, components: prev.components.map((c, i) => (i === ci ? { ...c, ...patch } : c)) })
  }, [setDraft])

  const setIngredient = useCallback((ci: number, ii: number, val: StructuredIngredient) => {
    setDraft((prev) => prev && {
      ...prev,
      components: prev.components.map((c, i) =>
        i === ci
          ? {
              ...c,
              ingredients: c.ingredients.map((ing, j) => (j === ii ? val : ing)),
              shopping_list_ingredients: c.shopping_list_ingredients?.map(
                (value, j) => j === ii ? serializeIngredient(val) : value,
              ) ?? null,
            }
          : c,
      ),
    })
  }, [setDraft])

  const setIngredientCategory = useCallback((ci: number, ii: number, category: ShoppingCategory) => {
    setDraft((previous) => previous && {
      ...previous,
      components: previous.components.map((component, componentIndex) =>
        componentIndex === ci
          ? {
              ...component,
              shopping_list_categories: component.shopping_list_categories.map(
                (value, ingredientIndex) => ingredientIndex === ii ? category : value
              ),
            }
          : component
      ),
    })
  }, [setDraft])

  const addIngredient = useCallback((ci: number) => {
    setDraft((prev) => prev && {
      ...prev,
      components: prev.components.map((c, i) =>
        i === ci
          ? {
              ...c,
              ingredients: [...c.ingredients, { qty: '', unit: '', name: '' }],
              shopping_list_ingredients: c.shopping_list_ingredients
                ? [...c.shopping_list_ingredients, '']
                : null,
              shopping_list_categories: [...c.shopping_list_categories, 'other'],
            }
          : c,
      ),
    })
  }, [setDraft])

  const removeIngredient = useCallback((ci: number, ii: number) => {
    setDraft((prev) => {
      if (!prev) return prev
      if (prev.components[ci].ingredients.length <= 1) return prev
      return {
        ...prev,
        components: prev.components.map((c, i) =>
          i === ci
            ? {
                ...c,
                ingredients: c.ingredients.filter((_, j) => j !== ii),
                shopping_list_ingredients: c.shopping_list_ingredients?.filter((_, j) => j !== ii) ?? null,
                shopping_list_categories: c.shopping_list_categories.filter((_, j) => j !== ii),
              }
            : c,
        ),
      }
    })
  }, [setDraft])

  const setStep = useCallback((ci: number, si: number, val: string) => {
    setDraft((prev) => prev && {
      ...prev,
      components: prev.components.map((c, i) =>
        i === ci ? { ...c, steps: c.steps.map((s, j) => (j === si ? val : s)) } : c,
      ),
    })
  }, [setDraft])

  const addStep = useCallback((ci: number) => {
    setDraft((prev) => prev && {
      ...prev,
      components: prev.components.map((c, i) => (i === ci ? { ...c, steps: [...c.steps, ''] } : c)),
    })
  }, [setDraft])

  const removeStep = useCallback((ci: number, si: number) => {
    setDraft((prev) => {
      if (!prev) return prev
      if (prev.components[ci].steps.length <= 1) return prev
      return {
        ...prev,
        components: prev.components.map((c, i) => (i === ci ? { ...c, steps: c.steps.filter((_, j) => j !== si) } : c)),
      }
    })
  }, [setDraft])

  const handleNutritionChange = useCallback((field: NutritionField, value: string) => {
    setDraft((prev) => prev && { ...prev, [field]: value })
  }, [setDraft])

  const handleServingsChange = useCallback((servings: number) => {
    setDraft((prev) => prev && { ...prev, servings: String(servings) })
  }, [setDraft])

  return {
    updateComp,
    setIngredient,
    setIngredientCategory,
    addIngredient,
    removeIngredient,
    setStep,
    addStep,
    removeStep,
    handleNutritionChange,
    handleServingsChange,
  }
}
