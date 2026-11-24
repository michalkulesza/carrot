import type {
  AllergenFlag,
  IngredientLinkKind,
  RecipeOut,
  RecipeSaveRequest,
  SaveComponent,
  ShoppingCategory,
} from '@carrot/shared/types'
import { getImperialCupQty } from '@carrot/shared/utils/ingredientScaling'
import { effectiveAllergenFlag } from '@carrot/shared/utils/allergenKeys'
import {
  displayIngredientWithLocalizedUnit,
  parseIngredient,
  serializeIngredient,
  type StructuredIngredient,
} from '@carrot/shared/utils/ingredientUtils'
import { scaleIngredientQuantity } from '@carrot/shared/utils/ingredientScaling'

export const KEEP_AWAKE_RECIPE_TAG = 'recipe-detail'
export const FONT_SIZE_STORAGE_KEY = 'recipe-font-size-index'

export const FONT_SIZES = [13, 16, 17, 20, 22] as const

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
  step_ingredient_component: (number | null)[] | null
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
      step_ingredient_component: component.step_ingredient_component ?? null,
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

export const buildEditRecipeSaveRequest = (
  recipe: RecipeOut,
  draft: EditDraft,
): RecipeSaveRequest => ({
  title: draft.title,
  servings: draft.servings !== '' ? Number(draft.servings) : null,
  total_time_minutes: draft.totalTimeMinutes !== '' ? Number(draft.totalTimeMinutes) : null,
  kcal_per_serving: draft.kcal !== '' ? Number(draft.kcal) : null,
  protein_per_serving: draft.protein !== '' ? Number(draft.protein) : null,
  fat_per_serving: draft.fat !== '' ? Number(draft.fat) : null,
  carbs_per_serving: draft.carbs !== '' ? Number(draft.carbs) : null,
  thumbnail_url: draft.thumbnail_url || null,
  source_url: recipe.source_url ?? null,
  notes: recipe.notes ?? null,
  creator_handle: recipe.creator_handle ?? null,
  components: draft.components.map((component, componentIndex) => {
    const stored = recipe.components[componentIndex]
    const shoppingListIngredients = component.shopping_list_ingredients
    const retainedIngredientIndexes = component.ingredients.flatMap((ingredient, index) =>
      ingredient.name ? [index] : [],
    )

    return {
      name: component.name ?? '',
      yield_note: component.yield_note ?? '',
      ingredients: retainedIngredientIndexes.map((index) =>
        serializeIngredient(component.ingredients[index]),
      ),
      shopping_list_ingredients: shoppingListIngredients
        ? retainedIngredientIndexes.map((index) => shoppingListIngredients[index])
        : null,
      shopping_list_categories: retainedIngredientIndexes.map(
        (index) => component.shopping_list_categories[index],
      ),
      steps: component.steps.filter(Boolean),
      metric_ingredients: stored?.metric_ingredients ?? null,
      imperial_ingredients: stored?.imperial_ingredients ?? null,
      metric_steps: stored?.metric_steps ?? null,
      imperial_steps: stored?.imperial_steps ?? null,
      ingredient_flags: [],
      step_ingredient_line: component.step_ingredient_line,
      step_ingredient_component: component.step_ingredient_component,
    }
  }),
  tag_ids: recipe.tags.map((tag) => tag.id),
})

export const getReadingMetrics = (fontSizeIndex: number) => {
  const fontSize = FONT_SIZES[fontSizeIndex]

  return {
    fontSize,
    ingredientLineHeight: Math.round(fontSize * 1.35),
    stepLineHeight: Math.round(fontSize * 1.5),
    noteLineHeight: Math.round(fontSize * 1.45),
  }
}

export type ReadingMetrics = ReturnType<typeof getReadingMetrics>

export const formatCookingTime = (minutes: number | null, t: (key: string) => string) => {
  if (minutes === null) return null
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (hours === 0) return `${minutes}${t('recipes.minutesShort')}`
  if (remainingMinutes === 0) return `${hours}${t('recipes.hoursShort')}`

  return `${hours}${t('recipes.hoursShort')}${remainingMinutes}${t('recipes.minutesShort')}`
}

export const getSourceHost = (sourceUrl: string | null) => {
  if (!sourceUrl) return null

  try {
    return new URL(sourceUrl).host.replace(/^www\./, '')
  } catch {
    return null
  }
}

export interface IngredientEntry {
  key: string
  ingredient: string
  cupHint: string
  shoppingListValue: string
  shoppingCategory: ShoppingCategory
  allergenFlag: AllergenFlag | null
  linkedRecipeUrl: string | null
  linkedRecipeKind: IngredientLinkKind | null
  linkedRecipeId: string | null
  linkedAllergens: string[] | null
}

export interface IngredientGroup {
  key: string
  name: string | null
  entries: IngredientEntry[]
}

export const getVariantIngredients = (component: SaveComponent, unitSystem: string): string[] =>
  unitSystem === 'imperial'
    ? component.imperial_ingredients ?? component.ingredients
    : component.metric_ingredients ?? component.ingredients

export const getVariantSteps = (component: SaveComponent, unitSystem: string): string[] =>
  unitSystem === 'imperial' ? component.imperial_steps ?? component.steps : component.metric_steps ?? component.steps

export const buildIngredientGroups = (
  components: SaveComponent[],
  unitSystem: string,
  servingScale: number,
  cupUnit: string,
): IngredientGroup[] =>
  components
    .map((component, componentIndex) => {
      const entries = getVariantIngredients(component, unitSystem).map((value, ingredientIndex): IngredientEntry => {
        const ingredient = scaleIngredientQuantity(value, servingScale)
        const originalValue = component.shopping_list_ingredients?.[ingredientIndex]
        const cupQty =
          unitSystem === 'imperial'
            ? null
            : getImperialCupQty(component.imperial_ingredients?.[ingredientIndex], servingScale, value)
        const flag = component.ingredient_flags?.[ingredientIndex]

        return {
          key: `${componentIndex}-${ingredientIndex}`,
          ingredient,
          cupHint: cupQty ? `${cupQty} ${cupUnit}` : '',
          shoppingListValue: servingScale === 1 && originalValue ? originalValue : ingredient,
          shoppingCategory: component.shopping_list_categories?.[ingredientIndex] ?? 'other',
          allergenFlag: effectiveAllergenFlag(flag) ?? null,
          linkedRecipeUrl: component.ingredient_links?.[ingredientIndex] ?? null,
          linkedRecipeKind: component.ingredient_link_kinds?.[ingredientIndex] ?? null,
          linkedRecipeId: component.linked_recipe_ids?.[ingredientIndex] ?? null,
          linkedAllergens: flag?.linked_allergens ?? null,
        }
      })

      return { key: `group-${componentIndex}`, name: component.name || null, entries }
    })
    .filter((group) => group.entries.length > 0)

export const splitIngredient = (
  ingredient: string,
  translateUnit: (unit: string, qty: string) => string,
): { quantity: string; name: string } => {
  const trimmed = (ingredient ?? '').trim()
  const range = trimmed.match(/^(\d+(?:[.,]\d+)?\s*[–—-]\s*\d+(?:[.,]\d+)?)\s+(.+)$/)
  const rangeParsed = range ? parseIngredient(`1 ${range[2]}`) : null

  if (range && rangeParsed?.unit) {
    return { quantity: `${range[1]} ${translateUnit(rangeParsed.unit, range[1])}`, name: rangeParsed.name }
  }

  const parsed = parseIngredient(ingredient)
  const unit = parsed.unit ? translateUnit(parsed.unit, parsed.qty) : ''

  return { quantity: [parsed.qty, unit].filter(Boolean).join(' '), name: parsed.name }
}
