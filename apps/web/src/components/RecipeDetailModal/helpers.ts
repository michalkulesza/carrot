import type {
  RecipeOut,
  RecipeSaveRequest,
  SaveComponent,
  StepIngredientRef,
} from '@carrot/shared/types'
import {
  getImperialCupQty,
  scaleIngredientQuantity,
} from '@carrot/shared/utils/ingredientScaling'
import { UNITS } from '../../api/client'

export type Mode = 'view' | 'editing' | 'confirming'

export const getHeaderBg = (mode: Mode): string => {
  if (mode === 'editing') return 'bg-warning-100 transition-colors duration-200'
  if (mode === 'confirming')
    return 'bg-danger-100 transition-colors duration-200'

  return 'transition-colors duration-200'
}

export interface EditState {
  title: string
  servings: string
  totalTimeMinutes: string
  kcal: string
  protein: string
  fat: string
  carbs: string
  thumbnail_url: string | null
  components: SaveComponent[]
  shared_to_personal: boolean
}

export const toEditState = (r: RecipeOut): EditState => {
  return {
    title: r.title,
    servings: r.servings?.toString() ?? '',
    totalTimeMinutes: r.total_time_minutes?.toString() ?? '',
    kcal: r.kcal_per_serving?.toString() ?? '',
    protein: r.protein_per_serving?.toString() ?? '',
    fat: r.fat_per_serving?.toString() ?? '',
    carbs: r.carbs_per_serving?.toString() ?? '',
    thumbnail_url: r.thumbnail_url,
    components: (r.components as SaveComponent[]).map((c) => ({
      ...c,
      ingredients: [...c.ingredients],
      steps: [...c.steps],
      ingredient_flags: c.ingredient_flags
        ? [...c.ingredient_flags]
        : undefined,
    })),
    shared_to_personal: r.shared_to_personal ?? true,
  }
}

export interface StructuredIngredient {
  qty: string
  unit: string
  name: string
}

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

export const displayIngredient = (
  s: string,
  t: (key: string, opts: { defaultValue: string }) => string
): string => {
  const parsed = parseIngredient(s)
  if (!parsed.unit)
    return typeof s === 'string' ? s : serializeIngredient(parsed)

  return serializeIngredient({
    ...parsed,
    unit: t(`units.${parsed.unit}`, { defaultValue: parsed.unit }),
  })
}

export const getScaledIngredientValues = (
  component: SaveComponent,
  unitSystem: string,
  servingScale: number
): string[] => {
  const ingredients =
    unitSystem === 'imperial'
      ? (component.imperial_ingredients ?? component.ingredients)
      : (component.metric_ingredients ?? component.ingredients)

  return ingredients.map((ingredient) =>
    scaleIngredientQuantity(ingredient, servingScale)
  )
}

export const getMetricCupHint = (
  component: SaveComponent,
  ingredientIndex: number,
  unitSystem: string,
  servingScale: number,
  t: (key: string, opts: { defaultValue: string }) => string
): string => {
  if (unitSystem === 'imperial') return ''

  const qty = getImperialCupQty(
    component.imperial_ingredients?.[ingredientIndex],
    servingScale
  )

  return qty ? ` (${qty} ${t('units.cup', { defaultValue: 'cup' })})` : ''
}

export const getShoppingListIngredient = (
  component: SaveComponent,
  ingredientIndex: number,
  unitSystem: string,
  servingScale: number
): string => {
  const ingredients =
    unitSystem === 'imperial'
      ? (component.imperial_ingredients ?? component.ingredients)
      : (component.metric_ingredients ?? component.ingredients)
  const scaledIngredient = scaleIngredientQuantity(
    ingredients[ingredientIndex] ??
      component.ingredients[ingredientIndex] ??
      '',
    servingScale
  )
  const originalShoppingListValue =
    component.shopping_list_ingredients?.[ingredientIndex]

  return servingScale === 1 && originalShoppingListValue
    ? originalShoppingListValue
    : scaledIngredient
}

// Client-side fallback when the AI step/ingredient matcher wasn't run: does simple name matching,
// trying the full ingredient name first, then individual words (handles cases like "soy" matching
// "filiżanka tamari soy" where a non-English unit gets absorbed into the name).
export const computeClientStepIngredientRefs = (
  comp: SaveComponent
): StepIngredientRef[][] =>
  comp.steps.map((step, index) => {
    if (index === comp.steps.length - 1) return []

    const refs: StepIngredientRef[] = []
    const stepLower = step.toLowerCase()
    comp.ingredients.forEach((ingStr, ii) => {
      const fullName = parseIngredient(ingStr)
        .name.split(',')[0]
        .trim()
        .toLowerCase()
      const candidates = [fullName]
      for (const word of fullName.split(/\s+/)) {
        if (word !== fullName && word.length >= 3 && !candidates.includes(word))
          candidates.push(word)
      }
      for (const searchName of candidates) {
        if (searchName.length < 3) continue
        let matched = false
        let idx = 0
        while (true) {
          const pos = stepLower.indexOf(searchName, idx)
          if (pos === -1) break
          const beforeOk = pos === 0 || !/\w/.test(stepLower[pos - 1])
          const afterOk =
            pos + searchName.length >= stepLower.length ||
            !/\w/.test(stepLower[pos + searchName.length])
          if (beforeOk && afterOk) {
            refs.push({
              ingredient_index: ii,
              mention: step.slice(pos, pos + searchName.length),
            })
            matched = true
          }
          idx = pos + searchName.length
        }
        if (matched) break
      }
    })

    return refs
  })

interface RecipeUpdateFromRecipeOverrides {
  components: SaveComponent[]
  notes: string | null
  tagIds: string[]
}

export const buildRecipeUpdateFromRecipe = (
  recipe: RecipeOut,
  overrides: RecipeUpdateFromRecipeOverrides
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
  notes: overrides.notes,
  components: overrides.components,
  tag_ids: overrides.tagIds,
  shared_to_personal: recipe.shared_to_personal,
})

export const applyIngredientReplace = (
  components: SaveComponent[],
  ci: number,
  ii: number
): SaveComponent[] | null => {
  const flag = components[ci].ingredient_flags?.[ii]
  if (!flag?.substitute) return null
  const originalDisplay = components[ci].ingredients[ii]
  const substitute = flag.substitute

  return components.map((c, cIdx) => {
    if (cIdx !== ci) return c
    const newIngredients = c.ingredients.map((ing, iIdx) =>
      iIdx === ii ? substitute : ing
    )
    const newFlags = (c.ingredient_flags ?? []).map((f, fIdx) =>
      fIdx === ii
        ? { ...f, substitute_applied: true, original_display: originalDisplay }
        : f
    )

    return { ...c, ingredients: newIngredients, ingredient_flags: newFlags }
  })
}

export const applyIngredientRestore = (
  components: SaveComponent[],
  ci: number,
  ii: number
): SaveComponent[] | null => {
  const flag = components[ci].ingredient_flags?.[ii]
  if (!flag?.original_display) return null
  const originalDisplay = flag.original_display

  return components.map((c, cIdx) => {
    if (cIdx !== ci) return c
    const newIngredients = c.ingredients.map((ing, iIdx) =>
      iIdx === ii ? originalDisplay : ing
    )
    const newFlags = (c.ingredient_flags ?? []).map((f, fIdx) =>
      fIdx === ii
        ? { ...f, substitute_applied: false, original_display: null }
        : f
    )

    return { ...c, ingredients: newIngredients, ingredient_flags: newFlags }
  })
}

export const buildRecipeUpdateFromDraft = (
  draft: EditState,
  recipe: RecipeOut,
  notes: string,
  tagIds: string[]
): RecipeSaveRequest => ({
  title: draft.title,
  servings: draft.servings !== '' ? Number(draft.servings) : null,
  total_time_minutes:
    draft.totalTimeMinutes !== '' ? Number(draft.totalTimeMinutes) : null,
  kcal_per_serving: draft.kcal !== '' ? Number(draft.kcal) : null,
  protein_per_serving: draft.protein !== '' ? Number(draft.protein) : null,
  fat_per_serving: draft.fat !== '' ? Number(draft.fat) : null,
  carbs_per_serving: draft.carbs !== '' ? Number(draft.carbs) : null,
  thumbnail_url: draft.thumbnail_url,
  creator_handle: recipe.creator_handle,
  source_url: recipe.source_url,
  notes: notes.trim() || null,
  components: draft.components,
  tag_ids: tagIds,
  shared_to_personal: draft.shared_to_personal,
})
