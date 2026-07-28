export type AddRecipeMethod = 'camera' | 'gallery' | 'text' | 'scratch' | 'personal-library'

export type AddRecipeSubview = 'picker' | 'text' | 'personal-library'

const HTTP_PROTOCOL_REGEX = /^https?:\/\//i
const DOMAIN_REGEX = /^(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z](?:[a-z\d-]{0,61}[a-z\d])?(?::\d{1,5})?(?:[/?#]|$)/i

export const normalizeHttpUrl = (value: string): string | null => {
  const trimmed = value.trim()
  if (!trimmed) return null

  const domainCandidate = trimmed.replace(HTTP_PROTOCOL_REGEX, '')
  if (!DOMAIN_REGEX.test(domainCandidate)) return null

  const candidate = HTTP_PROTOCOL_REGEX.test(trimmed) ? trimmed : `https://${trimmed}`

  try {
    const parsed = new URL(candidate)
    if (!parsed.hostname || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) return null

    return parsed.href
  } catch {
    return null
  }
}
