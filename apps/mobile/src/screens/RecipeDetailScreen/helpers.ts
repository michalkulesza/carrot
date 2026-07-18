import type { RecipeOut, RecipeSaveRequest, StepIngredientRef } from '@carrot/shared/types'
import { parseIngredient, type StructuredIngredient } from '@carrot/shared/utils/ingredientUtils'
import type { DurationMatch } from '../../context/TimerContext'

export const KEEP_AWAKE_RECIPE_TAG = 'recipe-detail'
export const SHOW_STEP_QTY_STORAGE_KEY = 'recipe-show-step-qty'
export const FONT_SIZE_STORAGE_KEY = 'recipe-font-size-index'

export const FONT_SIZES = [13, 16, 17, 20, 22] as const
export const LINE_HEIGHTS = [18, 21, 22, 25, 28] as const

export const capitalizeFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// Recipe-level allergen badges are derived from the per-ingredient flags
// Gemini already computed against the full predefined allergen list at
// import time — no extra call needed to know what's in a recipe.
export const getRecipeAllergens = (recipe: RecipeOut, activeAllergens: string[]): string[] => {
  const seen = new Set<string>()
  const allergens: string[] = []
  for (const component of recipe.components) {
    for (const flag of component.ingredient_flags ?? []) {
      if (
        !flag.allergen ||
        flag.substitute_applied ||
        !activeAllergens.some((allergen) => {
          const flagged = flag.allergen!.toLowerCase()
          const active = allergen.toLowerCase()
          return flagged === active || flagged.includes(active) || active.includes(flagged)
        })
      ) continue
      const key = flag.allergen.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      allergens.push(flag.allergen)
    }
  }
  return allergens
}

export interface EditComponent {
  name: string
  yield_note: string
  ingredients: StructuredIngredient[]
  shopping_list_ingredients: string[] | null
  steps: string[]
}
export interface EditDraft {
  title: string
  servings: string
  totalTimeMinutes: string
  kcal: string
  protein: string
  fat: string
  carbs: string
  thumbnail_url: string | null
  components: EditComponent[]
}

export const buildDraft = (recipe: RecipeOut): EditDraft => ({
  title: recipe.title,
  servings: recipe.servings?.toString() ?? '',
  totalTimeMinutes: recipe.total_time_minutes?.toString() ?? '',
  kcal: recipe.kcal_per_serving?.toString() ?? '',
  protein: recipe.protein_per_serving?.toString() ?? '',
  fat: recipe.fat_per_serving?.toString() ?? '',
  carbs: recipe.carbs_per_serving?.toString() ?? '',
  thumbnail_url: recipe.thumbnail_url,
  components: recipe.components.map((c) => ({
    name: c.name ?? '',
    yield_note: c.yield_note ?? '',
    ingredients: (c.ingredients as Array<string | StructuredIngredient>).map((raw) =>
      typeof raw === 'string' ? parseIngredient(raw) : raw,
    ),
    shopping_list_ingredients: c.shopping_list_ingredients ?? null,
    steps: c.steps,
  })),
})

export const buildRecipeSaveRequest = (
  recipe: RecipeOut,
  overrides: Partial<RecipeSaveRequest> = {},
): RecipeSaveRequest => ({
  title: recipe.title,
  servings: recipe.servings,
  total_time_minutes: recipe.total_time_minutes,
  kcal_per_serving: recipe.kcal_per_serving,
  protein_per_serving: recipe.protein_per_serving,
  fat_per_serving: recipe.fat_per_serving,
  carbs_per_serving: recipe.carbs_per_serving,
  thumbnail_url: recipe.thumbnail_url,
  creator_handle: recipe.creator_handle,
  source_url: recipe.source_url,
  notes: recipe.notes,
  components: recipe.components,
  tag_ids: recipe.tags.map((tag) => tag.id),
  shared_to_personal: recipe.shared_to_personal,
  ...overrides,
})

export type Segment =
  | { type: 'text'; text: string }
  | { type: 'mention'; text: string; ingredientIndex: number }
  | { type: 'timer'; seconds: number }

export const buildSegments = (
  step: string,
  stepRefs: StepIngredientRef[],
  durationMatch: DurationMatch | null,
): Segment[] => {
  const spans: { start: number; end: number; seg: Segment }[] = []

  for (const ref of stepRefs) {
    let idx = 0
    while (true) {
      const pos = step.indexOf(ref.mention, idx)
      if (pos === -1) break
      const beforeOk = pos === 0 || !/\w/.test(step[pos - 1])
      const afterOk = pos + ref.mention.length >= step.length || !/\w/.test(step[pos + ref.mention.length])
      if (beforeOk && afterOk) {
        spans.push({ start: pos, end: pos + ref.mention.length, seg: { type: 'mention', text: ref.mention, ingredientIndex: ref.ingredient_index } })
      }
      idx = pos + ref.mention.length
    }
  }

  if (durationMatch) {
    spans.push({ start: durationMatch.start, end: durationMatch.end, seg: { type: 'timer', seconds: durationMatch.seconds } })
  }

  spans.sort((a, b) => a.start - b.start)
  const filtered: typeof spans = []
  let cursor = 0
  for (const span of spans) {
    if (span.start >= cursor) {
      filtered.push(span)
      cursor = span.end
    }
  }
  const result: Segment[] = []
  let pos = 0
  for (const span of filtered) {
    if (pos < span.start) result.push({ type: 'text', text: step.slice(pos, span.start) })
    result.push(span.seg)
    pos = span.end
  }
  if (pos < step.length) result.push({ type: 'text', text: step.slice(pos) })
  return result
}
