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

  const setThumbnailUrl = (url: string) =>
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

  return { draft, setDraft, setField, setThumbnailUrl, setIngredient, setStep }
}
