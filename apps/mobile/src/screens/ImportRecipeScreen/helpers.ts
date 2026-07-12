import type {
  AllergenFlag,
  ImportDebugUsage,
  ImportResult,
  Ingredient,
  RecipeComponent,
  RecipeSaveRequest,
  StepIngredientRef,
  Tag,
} from '@carrot/shared/types'
import { parseIngredient, serializeIngredient } from '@carrot/shared/utils/ingredientUtils'
import type { StructuredIngredient } from '@carrot/shared/utils/ingredientUtils'

export type ImportMode = 'url' | 'camera' | 'gallery' | 'text' | 'share' | 'scratch'

export interface EditableComponent {
  name: string
  yield_note: string
  ingredients: StructuredIngredient[]
  steps: string[]
  ingredient_flags: (AllergenFlag | null)[]
  step_ingredient_refs: StepIngredientRef[][] | null
}

export interface EditableRecipe {
  title: string
  servings: string
  kcal: string
  protein: string
  fat: string
  carbs: string
  thumbnail_url: string | null
  creator_handle: string | null
  source_url: string | null
  components: EditableComponent[]
  suggestedTagNames: string[]
  debug: ImportDebugUsage | null
}

export const buildStepIngredientRefs = (component: RecipeComponent): StepIngredientRef[][] | null => {
  if (!component.step_refs || component.step_refs.length === 0) {
    return null
  }

  const stepCount = component.steps.length
  const refs: StepIngredientRef[][] = Array.from({ length: stepCount }, () => [])

  for (const ref of component.step_refs) {
    if (ref.step_index < stepCount) {
      refs[ref.step_index].push({ ingredient_index: ref.ingredient_index, mention: ref.mention })
    }
  }

  return refs
}

export const toEditableIngredient = (ing: Ingredient, autoSubstitute: boolean): StructuredIngredient => {
  const useSub = autoSubstitute && !!ing.allergen && !!ing.substitute
  const nameToUse = useSub ? ing.substitute! : ing.name

  if (!ing.qty) {
    return parseIngredient(nameToUse)
  }

  return { qty: ing.qty ?? '', unit: ing.unit ?? '', name: nameToUse }
}

export const toIngredientFlag = (ing: Ingredient, autoSubstitute: boolean): AllergenFlag => ({
  allergen: ing.allergen ?? null,
  substitute: ing.substitute ?? null,
  substitute_applied: autoSubstitute && !!ing.allergen && !!ing.substitute,
  original_display: null,
  ingredient_name: ing.name,
})

export const toEditableComponent = (component: RecipeComponent, autoSubstitute: boolean): EditableComponent => ({
  name: component.name ?? component.role,
  yield_note: component.yield_note ?? '',
  ingredients: component.ingredients.map((ing) => toEditableIngredient(ing, autoSubstitute)),
  steps: component.steps,
  ingredient_flags: component.ingredients.map((ing) => toIngredientFlag(ing, autoSubstitute)),
  step_ingredient_refs: buildStepIngredientRefs(component),
})

export const toEditable = (result: ImportResult, autoSubstitute: boolean): EditableRecipe => {
  const { recipe, metadata } = result

  return {
    title: recipe?.title ?? '',
    servings: recipe?.servings?.toString() ?? '',
    kcal: recipe?.kcal_per_serving?.toString() ?? '',
    protein: recipe?.protein_per_serving?.toString() ?? '',
    fat: recipe?.fat_per_serving?.toString() ?? '',
    carbs: recipe?.carbs_per_serving?.toString() ?? '',
    thumbnail_url: metadata.thumbnail_url,
    creator_handle: metadata.creator_handle,
    source_url: metadata.source_url || null,
    suggestedTagNames: recipe?.tags ?? [],
    debug: metadata.debug ?? null,
    components: (recipe?.components ?? []).map((c) => toEditableComponent(c, autoSubstitute)),
  }
}

export const blankRecipe = (): EditableRecipe => ({
  title: '',
  servings: '',
  kcal: '',
  protein: '',
  fat: '',
  carbs: '',
  thumbnail_url: null,
  creator_handle: null,
  source_url: null,
  suggestedTagNames: [],
  debug: null,
  components: [{
    name: 'Main',
    yield_note: '',
    ingredients: [{ qty: '', unit: '', name: '' }],
    steps: [''],
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
  kcal_per_serving: editable.kcal !== '' ? Number(editable.kcal) : null,
  protein_per_serving: editable.protein !== '' ? Number(editable.protein) : null,
  fat_per_serving: editable.fat !== '' ? Number(editable.fat) : null,
  carbs_per_serving: editable.carbs !== '' ? Number(editable.carbs) : null,
  thumbnail_url: editable.thumbnail_url,
  creator_handle: editable.creator_handle,
  source_url: editable.source_url,
  debug_model: editable.debug?.model ?? null,
  debug_input_tokens: editable.debug?.input_tokens ?? null,
  debug_output_tokens: editable.debug?.output_tokens ?? null,
  debug_total_tokens: editable.debug?.total_tokens ?? null,
  components: editable.components.map((c) => ({
    name: c.name,
    yield_note: c.yield_note,
    ingredients: c.ingredients.map(serializeIngredient),
    steps: c.steps,
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

// Progress target per pipeline stage key (0..1) — the backend only emits discrete
// named stages, no numeric progress value, so this is a heuristic approximation.
export const STAGE_PROGRESS: Record<string, number> = {
  fetching_page: 0.25,
  analyzing_page: 0.70,
  fetching_metadata: 0.15,
  checking_description: 0.35,
  checking_links: 0.55,
  fetching_transcript: 0.65,
  analyzing_transcript: 0.82,
  analyzing_text: 0.70,
  analyzing_image: 0.70,
}
