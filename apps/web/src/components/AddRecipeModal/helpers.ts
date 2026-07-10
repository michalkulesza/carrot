import type {
  AllergenFlag,
  ImportResult,
  RecipeComponent,
  RecipeSaveRequest,
  StageEvent,
  StepIngredientRef,
  Tag,
} from '@carrot/shared/types'
import { UNITS } from '../../api/client'

export interface StepState extends StageEvent {
  status: 'active' | 'done'
}

export interface StructuredIngredient {
  qty: string
  unit: string
  name: string
}

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
  stage: string
  components: EditableComponent[]
  suggestedTagNames: string[]
}

// Client-side heuristic mapping of stage keys to progress fractions, kept in
// sync with the equivalent STAGE_PROGRESS table in
// apps/mobile/src/screens/ImportRecipeScreen.tsx — the backend only emits
// discrete named stages, no numeric progress value.
export const STAGE_PROGRESS: Record<string, number> = {
  fetching_page: 0.25,
  analyzing_page: 0.7,
  fetching_metadata: 0.15,
  checking_description: 0.35,
  checking_links: 0.55,
  fetching_transcript: 0.65,
  analyzing_transcript: 0.82,
  analyzing_text: 0.7,
  analyzing_image: 0.7,
}

export const currentUsername = () =>
  localStorage.getItem('pk_username') || 'you'

export const clampToString = (raw: string, min: number, max: number): string =>
  String(Math.min(max, Math.max(min, Number(raw))))

export const parseIngredient = (s: string): StructuredIngredient => {
  const trimmed = typeof s === 'string' ? s.trim() : ''
  if (!trimmed) return { qty: '', unit: '', name: '' }
  const parts = trimmed.split(/\s+/)
  let idx = 0
  let qty = ''
  if (parts[idx] && /^[\d¼½¾⅓⅔⅛⅜⅝⅞.,/]+$/.test(parts[idx])) {
    qty = parts[idx++]
  }
  let unit = ''
  if (
    parts[idx] &&
    (UNITS as readonly string[]).includes(parts[idx].toLowerCase())
  ) {
    unit = parts[idx++].toLowerCase()
  }

  return { qty, unit, name: parts.slice(idx).join(' ') }
}

export const serializeIngredient = (ing: StructuredIngredient): string => {
  return [ing.qty, ing.unit, ing.name].filter(Boolean).join(' ')
}

export const toEditable = (
  result: ImportResult,
  autoSubstitute: boolean
): EditableRecipe => {
  const { recipe, metadata, stage } = result

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
    stage,
    suggestedTagNames: recipe?.tags ?? [],
    components: (recipe?.components ?? []).map((c: RecipeComponent) => {
      const numSteps = c.steps.length
      let step_ingredient_refs: StepIngredientRef[][] | null = null
      if (c.step_refs && c.step_refs.length > 0) {
        const arr: StepIngredientRef[][] = Array.from(
          { length: numSteps },
          () => []
        )
        for (const ref of c.step_refs) {
          if (ref.step_index < numSteps) {
            arr[ref.step_index].push({
              ingredient_index: ref.ingredient_index,
              mention: ref.mention,
            })
          }
        }
        step_ingredient_refs = arr
      }

      return {
        name: c.name ?? c.role,
        yield_note: c.yield_note ?? '',
        ingredients: c.ingredients.map((ing) => {
          const useSub = autoSubstitute && !!ing.allergen && !!ing.substitute
          const nameToUse = useSub ? ing.substitute! : ing.name
          // Gemini sometimes returns the full ingredient string in name with null qty/unit
          if (!ing.qty) {
            return parseIngredient(nameToUse)
          }

          return {
            qty: ing.qty ?? '',
            unit: ing.unit ?? '',
            name: nameToUse,
          }
        }),
        steps: c.steps,
        ingredient_flags: c.ingredients.map((ing) => ({
          allergen: ing.allergen ?? null,
          substitute: ing.substitute ?? null,
          substitute_applied:
            autoSubstitute && !!ing.allergen && !!ing.substitute,
          original_display: null,
          ingredient_name: ing.name,
        })),
        step_ingredient_refs,
      }
    }),
  }
}

export const buildSaveRecipePayload = (
  editable: EditableRecipe,
  selectedTags: Tag[],
  sharedToPersonal: boolean
): RecipeSaveRequest => ({
  title: editable.title,
  servings: editable.servings !== '' ? Number(editable.servings) : null,
  kcal_per_serving: editable.kcal !== '' ? Number(editable.kcal) : null,
  protein_per_serving:
    editable.protein !== '' ? Number(editable.protein) : null,
  fat_per_serving: editable.fat !== '' ? Number(editable.fat) : null,
  carbs_per_serving: editable.carbs !== '' ? Number(editable.carbs) : null,
  thumbnail_url: editable.thumbnail_url,
  creator_handle: editable.creator_handle,
  source_url: editable.source_url,
  components: editable.components.map((c) => ({
    name: c.name,
    yield_note: c.yield_note,
    ingredients: c.ingredients.map(serializeIngredient),
    steps: c.steps,
    ingredient_flags: c.ingredient_flags.map(
      (f) =>
        f ?? {
          allergen: null,
          substitute: null,
          substitute_applied: false,
          original_display: null,
        }
    ),
    step_ingredient_refs: c.step_ingredient_refs,
  })),
  tag_ids: selectedTags.map((t) => t.id),
  shared_to_personal: sharedToPersonal,
})
