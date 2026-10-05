import { useState } from 'react'
import type { EditState } from './helpers'

export type DraftTextField =
  | 'title'
  | 'servings'
  | 'totalTimeMinutes'
  | 'kcal'
  | 'protein'
  | 'fat'
  | 'carbs'

const mapComponent = (
  draft: EditState,
  componentIndex: number,
  update: (
    component: EditState['components'][number]
  ) => EditState['components'][number]
): EditState => ({
  ...draft,
  components: draft.components.map((component, index) =>
    index === componentIndex ? update(component) : component
  ),
})

export const useRecipeDraft = () => {
  const [draft, setDraft] = useState<EditState | null>(null)

  const setField = (field: DraftTextField, value: string) =>
    setDraft((current) => (current ? { ...current, [field]: value } : current))

  const setThumbnailUrl = (url: string | null) =>
    setDraft((current) =>
      current ? { ...current, thumbnail_url: url } : current
    )

  const setIngredient = (ci: number, ii: number, value: string) =>
    setDraft((current) =>
      current
        ? mapComponent(current, ci, (component) => ({
            ...component,
            ingredients: component.ingredients.map((ingredient, index) =>
              index === ii ? value : ingredient
            ),
          }))
        : current
    )

  const setStep = (ci: number, si: number, value: string) =>
    setDraft((current) =>
      current
        ? mapComponent(current, ci, (component) => ({
            ...component,
            steps: component.steps.map((step, index) =>
              index === si ? value : step
            ),
          }))
        : current
    )

  const addIngredient = (ci: number) =>
    setDraft((current) =>
      current
        ? mapComponent(current, ci, (component) => ({
            ...component,
            ingredients: [...component.ingredients, ''],
            shopping_list_ingredients: component.shopping_list_ingredients
              ? [...component.shopping_list_ingredients, '']
              : component.shopping_list_ingredients,
            shopping_list_categories: component.shopping_list_categories
              ? [...component.shopping_list_categories, 'other']
              : component.shopping_list_categories,
          }))
        : current
    )

  const removeIngredient = (ci: number, ii: number) =>
    setDraft((current) =>
      current
        ? mapComponent(current, ci, (component) => ({
            ...component,
            ingredients: component.ingredients.filter(
              (_, index) => index !== ii
            ),
            shopping_list_ingredients:
              component.shopping_list_ingredients?.filter(
                (_, index) => index !== ii
              ),
            shopping_list_categories:
              component.shopping_list_categories?.filter(
                (_, index) => index !== ii
              ),
          }))
        : current
    )

  // Pasted text re-parses every line, so per-line derived data is dropped
  // and rebuilt by the backend on save.
  const replaceIngredients = (ci: number, lines: string[]) =>
    setDraft((current) =>
      current
        ? mapComponent(current, ci, (component) => ({
            ...component,
            ingredients: lines,
            shopping_list_ingredients: null,
            shopping_list_categories: null,
          }))
        : current
    )

  const addStep = (ci: number) =>
    setDraft((current) =>
      current
        ? mapComponent(current, ci, (component) => ({
            ...component,
            steps: [...component.steps, ''],
          }))
        : current
    )

  const removeStep = (ci: number, si: number) =>
    setDraft((current) =>
      current
        ? mapComponent(current, ci, (component) => ({
            ...component,
            steps: component.steps.filter((_, index) => index !== si),
          }))
        : current
    )

  return {
    draft,
    setDraft,
    setField,
    setThumbnailUrl,
    setIngredient,
    setStep,
    addIngredient,
    removeIngredient,
    replaceIngredients,
    addStep,
    removeStep,
  }
}
