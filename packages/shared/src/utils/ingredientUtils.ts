import type { MealPlanEntry } from '../types'

export interface AggregatedIngredient {
  key: string
  name: string
  qtySummary: string
}

export const aggregateIngredients = (entries: MealPlanEntry[]): AggregatedIngredient[] => {
  const map = new Map<string, { qty: string[]; name: string }>()
  for (const entry of entries) {
    for (const component of entry.recipe.components) {
      for (const ing of component.ingredients) {
        if (!ing.name) continue
        const normalised = ing.name.trim().toLowerCase()
        const existing = map.get(normalised)
        const part = [ing.qty, ing.unit].filter(Boolean).join(' ')
        if (existing) {
          if (part) existing.qty.push(part)
        } else {
          map.set(normalised, { qty: part ? [part] : [], name: ing.name.trim() })
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
