import type { Ingredient, RecipeOut, StepIngredientRef } from '@carrot/shared/types'
import { parseIngredient, type StructuredIngredient } from '@carrot/shared/utils/ingredientUtils'
import type { DurationMatch } from '../../context/TimerContext'

export const KEEP_AWAKE_RECIPE_TAG = 'recipe-detail'
export const KEEP_AWAKE_STORAGE_KEY = 'recipe-keep-screen-default'
export const SHOW_STEP_QTY_STORAGE_KEY = 'recipe-show-step-qty'
export const FONT_SIZE_STORAGE_KEY = 'recipe-font-size-index'

export const FONT_SIZES = [13, 16, 17, 20, 22] as const
export const LINE_HEIGHTS = [18, 21, 22, 25, 28] as const

export const capitalizeFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export interface EditComponent {
  name: string
  yield_note: string
  ingredients: StructuredIngredient[]
  steps: string[]
}

export interface EditDraft {
  title: string
  servings: string
  kcal: string
  protein: string
  fat: string
  carbs: string
  notes: string
  thumbnail_url: string | null
  components: EditComponent[]
}

export const buildDraft = (recipe: RecipeOut): EditDraft => ({
  title: recipe.title,
  servings: recipe.servings?.toString() ?? '',
  kcal: recipe.kcal_per_serving?.toString() ?? '',
  protein: recipe.protein_per_serving?.toString() ?? '',
  fat: recipe.fat_per_serving?.toString() ?? '',
  carbs: recipe.carbs_per_serving?.toString() ?? '',
  notes: recipe.notes ?? '',
  thumbnail_url: recipe.thumbnail_url,
  components: recipe.components.map((c) => ({
    name: c.name ?? '',
    yield_note: c.yield_note ?? '',
    ingredients: (c.ingredients as Array<string | StructuredIngredient>).map((raw) =>
      typeof raw === 'string' ? parseIngredient(raw) : raw,
    ),
    steps: c.steps,
  })),
})

export const formatForList = (ing: Ingredient): string =>
  [ing.qty, ing.unit, ing.name].filter(Boolean).join(' ')

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
