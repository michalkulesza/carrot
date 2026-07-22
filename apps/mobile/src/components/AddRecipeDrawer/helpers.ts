export type AddRecipeMethod = 'camera' | 'gallery' | 'text' | 'scratch' | 'personal-library'

export type AddRecipeSubview = 'picker' | 'text' | 'personal-library'

export const normalizeHttpUrl = (value: string): string | null => {
  const trimmed = value.trim()
  if (!trimmed) return null

  const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`

  try {
    const parsed = new URL(candidate)
    if (!parsed.hostname || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) return null

    return parsed.href
  } catch {
    return null
  }
}
