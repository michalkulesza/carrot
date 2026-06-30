import { UNITS } from '../types'
import type { MealPlanEntry, StepIngredientRef } from '../types'

export interface StructuredIngredient {
  qty: string
  unit: string
  name: string
  note: string
}

export const parseIngredient = (s: string): StructuredIngredient => {
  const trimmed = (s ?? '').trim()
  if (!trimmed) return { qty: '', unit: '', name: '', note: '' }
  let rest = trimmed
  let note = ''
  const noteMatch = rest.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
  if (noteMatch) {
    rest = noteMatch[1].trim()
    note = noteMatch[2]
  }
  const parts = rest.split(/\s+/)
  let idx = 0
  let qty = ''
  if (parts[idx] && /^[\d¼½¾⅓⅔⅛⅜⅝⅞.,/]+$/.test(parts[idx])) {
    qty = parts[idx++]
  }
  let unit = ''
  if (parts[idx] && (UNITS as readonly string[]).includes(parts[idx].toLowerCase())) {
    unit = parts[idx++].toLowerCase()
  }
  return { qty, unit, name: parts.slice(idx).join(' '), note }
}

export const serializeIngredient = (ing: StructuredIngredient): string =>
  [ing.qty, ing.unit, ing.name, ing.note ? `(${ing.note})` : ''].filter(Boolean).join(' ')

export const displayIngredient = (
  s: string,
  t: (key: string, opts?: { defaultValue?: string }) => string,
): string => {
  const parsed = parseIngredient(s)
  if (!parsed.unit) return s
  return serializeIngredient({
    ...parsed,
    unit: t(`units.${parsed.unit}`, { defaultValue: parsed.unit }),
  })
}

export const buildClientStepRefs = (
  steps: string[],
  ingredients: string[],
): StepIngredientRef[][] =>
  steps.map((step) => {
    const refs: StepIngredientRef[] = []
    const stepLower = step.toLowerCase()
    ingredients.forEach((ingStr, ii) => {
      const fullName = parseIngredient(ingStr).name.split(',')[0].trim().toLowerCase()
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
            refs.push({ ingredient_index: ii, mention: step.slice(pos, pos + searchName.length) })
            matched = true
          }
          idx = pos + searchName.length
        }
        if (matched) break
      }
    })
    return refs
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
