import type { AllergenFlag } from '../types'

// EU-14 allergens plus common intolerances. Must stay in sync with
// ALLERGENS in services/api/src/api/constants.py — the backend always
// checks recipes against this full list, regardless of user preferences.
export const ALLERGEN_KEYS = [
  'gluten',
  'crustaceans',
  'tree nuts',
  'celery',
  'mustard',
  'sulphites',
  'lupin',
  'molluscs',
  'eggs',
  'fish',
  'peanuts',
  'soybeans',
  'milk',
  'sesame',
]

export const INTOLERANCE_KEYS = [
  'lactose',
  'ncgs',
  'fructose',
  'histamine',
  'fodmap',
  'caffeine',
  'sulphite-sensitivity',
  'sorbitol',
  'salicylates',
  'msg',
]

export const normalizeAllergenKey = (key: string) => key.replace(/[- ]/g, '_')

export const matchesActiveAllergen = (
  allergen: string | null | undefined,
  activeAllergens: string[]
) =>
  !!allergen &&
  activeAllergens.some((active) => {
    const flagged = allergen.toLowerCase()
    const wanted = active.toLowerCase()

    return (
      flagged === wanted || flagged.includes(wanted) || wanted.includes(flagged)
    )
  })

// A resolved linked recipe is the source of truth for its ingredient's allergens,
// so the line's own flag is dropped unless the user already applied its substitute.
export const effectiveAllergenFlag = <T extends AllergenFlag>(
  flag: T | null | undefined
): T | null | undefined =>
  flag && flag.linked_allergens != null && !flag.substitute_applied
    ? { ...flag, allergen: null, substitute: null }
    : flag

export const flagAllergens = (
  flag: AllergenFlag | null | undefined
): string[] => {
  const effective = effectiveAllergenFlag(flag)
  if (!effective || effective.substitute_applied) return []

  return (
    effective.linked_allergens ?? (effective.allergen ? [effective.allergen] : [])
  )
}
