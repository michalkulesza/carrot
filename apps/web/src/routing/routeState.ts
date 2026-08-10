import type { Location } from 'react-router-dom'

export type ImportMode = 'url' | 'text' | 'image'
export type StepLocation = { componentIndex: number; stepIndex: number }
export type RecipeFilters = { q: string; favourites: boolean; tagIds: string[] }

export const isRecipeId = (value: string | null): value is string =>
  Boolean(
    value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  )

export const recipePath = (id: string, step?: StepLocation) => {
  const params = new URLSearchParams()
  if (step) params.set('step', `${step.componentIndex}-${step.stepIndex}`)
  const query = params.toString()

  return `/recipe/${encodeURIComponent(id)}${query ? `?${query}` : ''}`
}

export const parseStep = (value: string | null): StepLocation | null => {
  const match = value?.match(/^(0|[1-9]\d*)-(0|[1-9]\d*)$/)

  return match
    ? { componentIndex: Number(match[1]), stepIndex: Number(match[2]) }
    : null
}

export const parseImportMode = (value: string | null): ImportMode =>
  value === 'text' || value === 'image' ? value : 'url'

export const addRecipePath = (mode: ImportMode = 'url') =>
  mode === 'url' ? '/recipe/new' : `/recipe/new?mode=${mode}`

export const parseRecipeFilters = (
  params: URLSearchParams,
  tagIds: Set<string>
): RecipeFilters => {
  const q = (params.get('q') ?? '').trim()
  const favourites = params.get('favorites') === '1'
  const tagIdsFromUrl = (params.get('tags') ?? '')
    .split(',')
    .filter((id) => tagIds.has(id))

  return { q, favourites, tagIds: [...new Set(tagIdsFromUrl)].sort() }
}

export const recipeFiltersPath = (
  location: Location,
  filters: RecipeFilters
) => {
  const params = new URLSearchParams(location.search)
  if (filters.q) params.set('q', filters.q)
  else params.delete('q')
  if (filters.favourites) params.set('favorites', '1')
  else params.delete('favorites')
  if (filters.tagIds.length)
    params.set('tags', [...new Set(filters.tagIds)].sort().join(','))
  else params.delete('tags')
  const query = params.toString()

  return `/${query ? `?${query}` : ''}${location.hash}`
}

export const parseMonth = (
  value: string | null,
  current: string
): string | null => {
  if (!value) return current
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null

  return value
}

export const planPath = (month: string, current: string) =>
  month === current ? '/plan' : `/plan?month=${month}`

export const settingsHashes = new Set([
  '#profile',
  '#stats',
  '#households',
  '#my-recipes',
  '#allergies',
  '#preferences',
  '#timers',
  '#data',
  '#account',
])

export const isSafeReturnPath = (value: string | null): value is string => {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return false
  try {
    const parsed = new URL(value, window.location.origin)

    return (
      parsed.origin === window.location.origin &&
      (parsed.pathname === '/' ||
        parsed.pathname === '/plan' ||
        parsed.pathname === '/shopping' ||
        parsed.pathname === '/settings' ||
        parsed.pathname === '/recipe/new' ||
        /^\/recipe\/[0-9a-f-]+$/i.test(parsed.pathname) ||
        /^\/r\/[^/]+$/.test(parsed.pathname))
    )
  } catch {
    return false
  }
}
