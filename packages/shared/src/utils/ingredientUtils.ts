import { UNITS } from '../types'
import type { MealPlanEntry, StepIngredientRef } from '../types'

export interface StructuredIngredient {
  qty: string
  unit: string
  name: string
}

export const parseIngredient = (s: string): StructuredIngredient => {
  const trimmed = (s ?? '').trim()
  if (!trimmed) return { qty: '', unit: '', name: '' }
  const parts = trimmed.split(/\s+/)
  let idx = 0
  let qty = ''
  if (parts[idx] && /^[\d¼½¾⅓⅔⅛⅜⅝⅞.,/]+$/.test(parts[idx])) {
    qty = parts[idx++]
    if (
      /^\d+(?:[.,]\d+)?$/.test(qty) &&
      parts[idx] &&
      /^(?:\d+[\/⁄]\d+|[¼½¾⅓⅔⅛⅜⅝⅞])$/.test(parts[idx])
    ) {
      qty += ` ${parts[idx++]}`
    }
  }
  let unit = ''
  if (parts[idx] && (UNITS as readonly string[]).includes(parts[idx].toLowerCase())) {
    unit = parts[idx++].toLowerCase()
  }
  return { qty, unit, name: parts.slice(idx).join(' ') }
}

export const serializeIngredient = (ing: StructuredIngredient): string =>
  [ing.qty, ing.unit, ing.name].filter(Boolean).join(' ')

export const FRACTION_OPTIONS = ['1/8', '1/4', '1/3', '3/8', '1/2', '5/8', '2/3', '3/4', '7/8'] as const
export const DECIMAL_OPTIONS = ['0.1', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7', '0.8', '0.9'] as const
export const QUANTITY_REMAINDER_OPTIONS = ['0', ...FRACTION_OPTIONS, ...DECIMAL_OPTIONS] as const

const UNICODE_FRACTIONS: Record<string, string> = {
  '¼': '1/4', '½': '1/2', '¾': '3/4', '⅓': '1/3', '⅔': '2/3', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8',
}

const fractionValue = (fraction: string): number => {
  const [numerator, denominator] = fraction.split('/').map(Number)

  return numerator / denominator
}

const remainderValue = (remainder: string): number =>
  remainder.includes('/') ? fractionValue(remainder) : Number(remainder)

const closestRemainder = (value: number, preferDecimal: boolean): string => {
  const options = preferDecimal
    ? [...DECIMAL_OPTIONS, ...FRACTION_OPTIONS, '0']
    : [...FRACTION_OPTIONS, ...DECIMAL_OPTIONS, '0']

  return options.reduce((closest, option) =>
    Math.abs(remainderValue(option) - value) < Math.abs(remainderValue(closest) - value)
      ? option
      : closest,
  )
}

export const parseQtyParts = (qty: string): { whole: number; remainder: string } => {
  const normalizedQty = (qty ?? '').trim()
  const decimalMatch = normalizedQty.match(/^(\d+)(?:[.,](\d+))?$/)

  if (decimalMatch) {
    const whole = parseInt(decimalMatch[1], 10)
    const decimalPart = decimalMatch[2]

    if (!decimalPart) return { whole, remainder: '0' }

    return {
      whole,
      remainder: closestRemainder(Number(`0.${decimalPart}`), true),
    }
  }

  const parts = normalizedQty.split(/\s+/)
  let whole = 0
  let remainder = '0'

  for (const part of parts) {
    if (/^\d+$/.test(part)) {
      whole = parseInt(part, 10)
      continue
    }

    const normalizedPart = UNICODE_FRACTIONS[part] ?? part

    if ((FRACTION_OPTIONS as readonly string[]).includes(normalizedPart)) {
      remainder = normalizedPart
    }
  }

  return { whole, remainder }
}

export const serializeQtyParts = (
  whole: number,
  remainder: string,
  decimalSeparator: '.' | ',',
): string => {
  if (remainder === '0') return whole > 0 ? String(whole) : ''

  if ((DECIMAL_OPTIONS as readonly string[]).includes(remainder)) {
    const decimal = (whole + Number(remainder)).toFixed(1)

    return decimalSeparator === ',' ? decimal.replace('.', ',') : decimal
  }

  return whole > 0 ? `${whole} ${remainder}` : remainder
}

export const displayIngredient = (s: string): string => {
  const parsed = parseIngredient(s)
  if (!parsed.unit) return s
  return serializeIngredient(parsed)
}

const STEP_REF_STOP_WORDS = new Set([
  'and', 'avec', 'con', 'et', 'for', 'für', 'i', 'mit', 'oraz', 'para', 'the',
  'und', 'with', 'y',
])

const isWordCharacter = (value: string | undefined): boolean =>
  value !== undefined && /[\p{L}\p{N}_]/u.test(value)

const findPhrasePositions = (text: string, phrase: string): number[] => {
  const positions: number[] = []
  let start = 0
  while (start <= text.length - phrase.length) {
    const position = text.indexOf(phrase, start)
    if (position === -1) break
    const end = position + phrase.length
    if (!isWordCharacter(text[position - 1]) && !isWordCharacter(text[end])) {
      positions.push(position)
    }
    start = end
  }
  return positions
}

const normalizedWords = (value: string): string =>
  value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu)?.join(' ') ?? ''

interface MatchSpan {
  start: number
  end: number
}

const overlapsSpan = (span: MatchSpan, occupied: MatchSpan[]): boolean =>
  occupied.some((candidate) => span.start < candidate.end && span.end > candidate.start)

export const buildClientStepRefs = (
  steps: string[],
  ingredients: string[],
): StepIngredientRef[][] =>
  steps.map((step, index) => {
    if (index === steps.length - 1) return []

    const refs: StepIngredientRef[] = []
    const occupied: MatchSpan[] = []
    const stepLower = step.toLocaleLowerCase()
    const ingredientNames = ingredients.map((ingredient) =>
      parseIngredient(ingredient).name.split(',')[0].trim().toLocaleLowerCase(),
    )
    const exactOrder = ingredientNames
      .map((name, ingredientIndex) => ({ name, ingredientIndex }))
      .filter(({ name }) => name.length >= 3)
      .sort((a, b) => b.name.length - a.name.length)
    const matchedIngredients = new Set<number>()

    for (const { name, ingredientIndex } of exactOrder) {
      const position = findPhrasePositions(stepLower, name).find((candidate) => {
        const span = { start: candidate, end: candidate + name.length }
        return !overlapsSpan(span, occupied)
      })
      if (position === undefined) continue

      occupied.push({ start: position, end: position + name.length })
      matchedIngredients.add(ingredientIndex)
      refs.push({
        ingredient_index: ingredientIndex,
        mention: step.slice(position, position + name.length),
      })
    }

    const tokenOwners = new Map<string, Set<number>>()
    ingredientNames.forEach((name, ingredientIndex) => {
      for (const token of new Set(normalizedWords(name).split(' '))) {
        if (token.length < 3 || STEP_REF_STOP_WORDS.has(token)) continue
        const owners = tokenOwners.get(token) ?? new Set<number>()
        owners.add(ingredientIndex)
        tokenOwners.set(token, owners)
      }
    })

    ingredientNames.forEach((name, ingredientIndex) => {
      if (matchedIngredients.has(ingredientIndex)) return
      const tokens = [...new Set(normalizedWords(name).split(' '))]
        .filter((token) =>
          token.length >= 3
          && !STEP_REF_STOP_WORDS.has(token)
          && tokenOwners.get(token)?.size === 1,
        )
        .sort((a, b) => b.length - a.length)

      for (const token of tokens) {
        const position = findPhrasePositions(stepLower, token).find((candidate) => {
          const span = { start: candidate, end: candidate + token.length }
          return !overlapsSpan(span, occupied)
        })
        if (position === undefined) continue

        occupied.push({ start: position, end: position + token.length })
        refs.push({
          ingredient_index: ingredientIndex,
          mention: step.slice(position, position + token.length),
        })
        break
      }
    })

    return refs.sort((a, b) => a.ingredient_index - b.ingredient_index)
  })

export const mergeStepIngredientRefs = (
  importedRefs: StepIngredientRef[][] | null | undefined,
  clientRefs: StepIngredientRef[][],
): StepIngredientRef[][] =>
  clientRefs.map((fallbackRefs, stepIndex) => {
    const fallbackByMention = new Map(
      fallbackRefs.map((ref) => [normalizedWords(ref.mention), ref]),
    )
    const refs = (importedRefs?.[stepIndex] ?? []).map((ref) => {
      const fallback = fallbackByMention.get(normalizedWords(ref.mention))
      return fallback && fallback.ingredient_index !== ref.ingredient_index
        ? { ...ref, ingredient_index: fallback.ingredient_index, mention: fallback.mention }
        : ref
    })
    const referencedIngredientIndexes = new Set(refs.map((ref) => ref.ingredient_index))
    const missingRefs = fallbackRefs.filter(
      (ref) => !referencedIngredientIndexes.has(ref.ingredient_index),
    )
    const seen = new Set<number>()
    return [...refs, ...missingRefs].filter((ref) => {
      if (seen.has(ref.ingredient_index)) return false
      seen.add(ref.ingredient_index)
      return true
    })
  })

export interface AggregatedIngredient {
  key: string
  name: string
  qtySummary: string
}

const parseIngStr = (raw: string): { qty: string; name: string } => {
  const clean = raw.replace(/\(.*?\)/g, '').trim()
  const parts = clean.split(/\s+/)
  let idx = 0
  let qty = ''
  if (parts[idx] && /^[\d¼½¾⅓⅔⅛⅜⅝⅞.,/]+$/.test(parts[idx])) {
    qty = parts[idx++]
  }
  if (parts[idx] && parts[idx].length <= 6 && /^[a-z]+$/.test(parts[idx])) {
    qty = [qty, parts[idx++]].filter(Boolean).join(' ')
  }
  return { qty, name: parts.slice(idx).join(' ') }
}

export const aggregateIngredients = (entries: MealPlanEntry[]): AggregatedIngredient[] => {
  const map = new Map<string, { qty: string[]; name: string }>()
  for (const entry of entries) {
    if (!entry.recipe) continue
    for (const component of entry.recipe.components) {
      for (const ingStr of component.ingredients) {
        if (!ingStr.trim()) continue
        const { qty, name } = parseIngStr(ingStr)
        if (!name) continue
        const normalised = name.toLowerCase()
        const existing = map.get(normalised)
        if (existing) {
          if (qty) existing.qty.push(qty)
        } else {
          map.set(normalised, { qty: qty ? [qty] : [], name })
        }
      }
    }
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, { name, qty }]) => ({
      key,
      name,
      qtySummary: qty.join(', '),
    }))
}
