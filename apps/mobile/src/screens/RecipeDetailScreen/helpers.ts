import type { RecipeOut, RecipeSaveRequest, SaveComponent, ShoppingCategory } from '@carrot/shared/types'
import { displayIngredient, parseIngredient, type StructuredIngredient } from '@carrot/shared/utils/ingredientUtils'
import { scaleIngredientQuantity } from '@carrot/shared/utils/ingredientScaling'
import type { DurationMatch } from '../../context/TimerContext'

export const KEEP_AWAKE_RECIPE_TAG = 'recipe-detail'
export const FONT_SIZE_STORAGE_KEY = 'recipe-font-size-index'
export const RAIL_VISIBLE_STORAGE_KEY = 'cook-mode-ingredient-rail'

export const FONT_SIZES = [13, 16, 17, 20, 22] as const
export const LINE_HEIGHTS = [18, 21, 22, 25, 28] as const

export const capitalizeFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export const matchesActiveAllergen = (
  allergen: string | null,
  activeAllergens: string[],
) =>
  !!allergen &&
  activeAllergens.some((activeAllergen) => {
    const flagged = allergen.toLowerCase()
    const active = activeAllergen.toLowerCase()
    return flagged === active || flagged.includes(active) || active.includes(flagged)
  })

export interface EditComponent {
  name: string
  yield_note: string
  ingredients: StructuredIngredient[]
  shopping_list_ingredients: string[] | null
  shopping_list_categories: ShoppingCategory[]
  steps: string[]
  step_ingredient_line: (number | null)[] | null
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
  components: recipe.components.map((component) => {
    const shoppingListCategories = component.shopping_list_categories ?? []
    const ingredients = (component.ingredients as Array<string | StructuredIngredient>).map((raw) =>
      typeof raw === 'string' ? parseIngredient(raw) : raw,
    )

    return {
      name: component.name ?? '',
      yield_note: component.yield_note ?? '',
      ingredients,
      shopping_list_ingredients: component.shopping_list_ingredients ?? null,
      shopping_list_categories: ingredients.map(
        (_, index) => shoppingListCategories[index] ?? 'other'
      ),
      steps: component.steps,
      step_ingredient_line: component.step_ingredient_line ?? null,
    }
  }),
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
  ...overrides,
})

export interface RailRow {
  key: string
  kind: 'header' | 'ingredient'
  text: string
}

export const showRailComponentHeaders = (components: SaveComponent[]): boolean => components.length > 1

const railVariantIngredients = (component: SaveComponent, unitSystem: string): string[] =>
  unitSystem === 'imperial'
    ? component.imperial_ingredients ?? component.ingredients
    : component.metric_ingredients ?? component.ingredients

export const buildIngredientRailRows = (
  components: SaveComponent[],
  unitSystem: string,
  servingScale: number,
): RailRow[] => {
  const showHeaders = showRailComponentHeaders(components)
  const rows: RailRow[] = []
  components.forEach((component, componentIndex) => {
    if (showHeaders) {
      rows.push({ key: `h${componentIndex}`, kind: 'header', text: component.name ?? '' })
    }
    railVariantIngredients(component, unitSystem).forEach((ingredient, ingredientIndex) => {
      rows.push({
        key: `${componentIndex}-${ingredientIndex}`,
        kind: 'ingredient',
        text: displayIngredient(scaleIngredientQuantity(ingredient, servingScale)),
      })
    })
  })
  return rows
}

export const railFlatIndex = (
  components: SaveComponent[],
  showHeaders: boolean,
  componentIndex: number,
  ingredientIndex: number,
): number => {
  let rows = 0
  for (let i = 0; i < componentIndex; i++) {
    rows += (showHeaders ? 1 : 0) + components[i].ingredients.length
  }
  return rows + (showHeaders ? 1 : 0) + ingredientIndex
}

export const resolveRailTargets = (components: SaveComponent[]): number[] => {
  const showHeaders = showRailComponentHeaders(components)
  const targets: number[] = []
  let lastTarget = 0
  components.forEach((component, componentIndex) => {
    const lines = component.step_ingredient_line ?? []
    component.steps.forEach((_, stepIndex) => {
      const line = lines[stepIndex]
      if (line != null) {
        lastTarget = railFlatIndex(components, showHeaders, componentIndex, line)
      }
      targets.push(lastTarget)
    })
  })
  return targets
}

export type Segment =
  | { type: 'text'; text: string }
  | { type: 'timer'; seconds: number }

export const buildSegments = (
  step: string,
  durationMatch: DurationMatch | null,
): Segment[] => {
  if (!durationMatch) return [{ type: 'text', text: step }]

  const segments: Segment[] = []
  if (durationMatch.start > 0) segments.push({ type: 'text', text: step.slice(0, durationMatch.start) })
  segments.push({ type: 'timer', seconds: durationMatch.seconds })
  if (durationMatch.end < step.length) segments.push({ type: 'text', text: step.slice(durationMatch.end) })

  return segments
}
