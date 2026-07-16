import type { AllergenFlag, RecipeSaveRequest, StepIngredientRef, Tag } from '@carrot/shared/types'
import { serializeIngredient } from '@carrot/shared/utils/ingredientUtils'
import type { StructuredIngredient } from '@carrot/shared/utils/ingredientUtils'

export interface EditableComponent {
  name: string
  yield_note: string
  ingredients: StructuredIngredient[]
  shopping_list_ingredients: string[] | null
  steps: string[]
  metric_ingredients: string[] | null
  imperial_ingredients: string[] | null
  metric_steps: string[] | null
  imperial_steps: string[] | null
  ingredient_flags: (AllergenFlag | null)[]
  step_ingredient_refs: StepIngredientRef[][] | null
}
export interface EditableRecipe {
  title: string
  servings: string
  totalTimeMinutes: string
  kcal: string
  protein: string
  fat: string
  carbs: string
  thumbnail_url: string | null
  creator_handle: string | null
  source_url: string | null
  components: EditableComponent[]
  suggestedTagNames: string[]
}

export const blankRecipe = (): EditableRecipe => ({
  title: '',
  servings: '',
  totalTimeMinutes: '',
  kcal: '',
  protein: '',
  fat: '',
  carbs: '',
  thumbnail_url: null,
  creator_handle: null,
  source_url: null,
  suggestedTagNames: [],
  components: [{
    name: 'Main',
    yield_note: '',
    ingredients: [{ qty: '', unit: '', name: '' }],
    shopping_list_ingredients: null,
    steps: [''],
    metric_ingredients: null,
    imperial_ingredients: null,
    metric_steps: null,
    imperial_steps: null,
    ingredient_flags: [null],
    step_ingredient_refs: null,
  }],
})

export const buildRecipeSavePayload = (
  editable: EditableRecipe,
  selectedTags: Tag[],
  sharedToPersonal: boolean,
): RecipeSaveRequest => ({
  title: editable.title,
  servings: editable.servings !== '' ? Number(editable.servings) : null,
  total_time_minutes: editable.totalTimeMinutes !== '' ? Number(editable.totalTimeMinutes) : null,
  kcal_per_serving: editable.kcal !== '' ? Number(editable.kcal) : null,
  protein_per_serving: editable.protein !== '' ? Number(editable.protein) : null,
  fat_per_serving: editable.fat !== '' ? Number(editable.fat) : null,
  carbs_per_serving: editable.carbs !== '' ? Number(editable.carbs) : null,
  thumbnail_url: editable.thumbnail_url,
  creator_handle: editable.creator_handle,
  source_url: editable.source_url,
  components: editable.components.map((c) => ({
    name: c.name,
    yield_note: c.yield_note,
    ingredients: c.ingredients.map(serializeIngredient),
    shopping_list_ingredients: c.shopping_list_ingredients,
    steps: c.steps,
    metric_ingredients: c.metric_ingredients,
    imperial_ingredients: c.imperial_ingredients,
    metric_steps: c.metric_steps,
    imperial_steps: c.imperial_steps,
    ingredient_flags: c.ingredient_flags.map(
      (f) => f ?? { allergen: null, substitute: null, substitute_applied: false, original_display: null },
    ),
    step_ingredient_refs: c.step_ingredient_refs,
  })),
  tag_ids: selectedTags.map((tag) => tag.id),
  shared_to_personal: sharedToPersonal,
})

export const isBlankRecipe = (r: EditableRecipe): boolean =>
  !r.title.trim() &&
  !r.thumbnail_url &&
  r.components.every(
    (c) =>
      c.ingredients.every((ing) => !ing.name.trim()) &&
      c.steps.every((s) => !s.trim()),
  )
