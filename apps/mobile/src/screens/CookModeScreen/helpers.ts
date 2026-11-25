import type { SaveComponent } from '@carrot/shared/types'
import { scaleIngredientQuantity } from '@carrot/shared/utils/ingredientScaling'
import { parseDurationMatches, type DurationMatch } from '@carrot/shared/utils/timerUtils'
import { resolveStepAnchors } from '@carrot/shared/utils/stepAnchors'
import { getVariantIngredients, splitIngredient } from '../RecipeDetailScreen/helpers'

export const KEEP_AWAKE_COOK_TAG = 'cook-mode'
export const FONT_SCALE_STORAGE_KEY = 'cook-mode-font-scale'
export const FONT_SCALES = [0.8, 1, 1.35]

export const stepStorageKey = (recipeId: string) => `cook-mode:${recipeId}`
export const checkedStorageKey = (recipeId: string) => `cook-mode-checked:${recipeId}`

export const getNextFontScale = (current: number) => {
  const currentIndex = FONT_SCALES.findIndex((scale) => scale === current)

  return FONT_SCALES[(currentIndex + 1) % FONT_SCALES.length]
}

export const parseFontScale = (value: string | null) => {
  const saved = Number(value)

  return FONT_SCALES.find((scale) => scale === saved) ?? 1
}

export const scaleTextStyle = (style: { fontSize?: number; lineHeight?: number }, scale: number) => ({
  fontSize: Math.round((style.fontSize ?? 0) * scale),
  lineHeight: Math.round((style.lineHeight ?? 0) * scale),
})

export interface CookStep {
  componentIndex: number
  stepIndex: number
  text: string
  componentName: string | null
}

export const buildCookSteps = (components: SaveComponent[]): CookStep[] => {
  const componentsWithSteps = components.filter((component) => component.steps.length > 0)
  const showComponentName = componentsWithSteps.length > 1

  return components.flatMap((component, componentIndex) =>
    component.steps.map((text, stepIndex) => ({
      componentIndex,
      stepIndex,
      text,
      componentName: showComponentName && component.name ? component.name : null,
    })),
  )
}

export const findStepIndex = (steps: CookStep[], componentIndex: number, stepIndex: number) =>
  steps.findIndex((step) => step.componentIndex === componentIndex && step.stepIndex === stepIndex)

export const getIngredientKey = (componentIndex: number, ingredientIndex: number) =>
  `${componentIndex}-${ingredientIndex}`

export interface CookIngredient {
  key: string
  quantity: string
  name: string
}

export interface CookIngredientGroup {
  key: string
  name: string | null
  ingredients: CookIngredient[]
}

export const buildCookIngredientGroups = (
  components: SaveComponent[],
  unitSystem: string,
  servingScale: number,
  translateUnit: (unit: string, qty: string) => string,
): CookIngredientGroup[] =>
  components
    .map((component, componentIndex) => ({
      key: `group-${componentIndex}`,
      name: component.name || null,
      ingredients: getVariantIngredients(component, unitSystem).map((ingredient, ingredientIndex) => {
        const scaled = scaleIngredientQuantity(ingredient, servingScale)

        return { key: getIngredientKey(componentIndex, ingredientIndex), ...splitIngredient(scaled, translateUnit) }
      }),
    }))
    .filter((group) => group.ingredients.length > 0)

export const resolveStepAnchorKeys = (components: SaveComponent[]): (string | undefined)[] =>
  resolveStepAnchors(components).map((anchor) =>
    anchor ? getIngredientKey(anchor.componentIndex, anchor.ingredientIndex) : undefined
  )

export const getUniqueDurations = (text: string): DurationMatch[] => {
  const seen = new Set<number>()

  return parseDurationMatches(text).filter(({ seconds }) => {
    if (seen.has(seconds)) return false

    seen.add(seconds)
    return true
  })
}

export const buildTimerId = (recipeId: string, step: CookStep, durationIndex: number) =>
  `${recipeId}-c${step.componentIndex}-s${step.stepIndex}-d${durationIndex}`

export const countGathered = (groups: CookIngredientGroup[], checked: Set<string>) =>
  groups.reduce((total, group) => total + group.ingredients.filter(({ key }) => checked.has(key)).length, 0)
