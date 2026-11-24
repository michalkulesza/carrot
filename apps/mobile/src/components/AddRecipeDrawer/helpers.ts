const HTTP_PROTOCOL_REGEX = /^https?:\/\//i
const DOMAIN_REGEX = /^(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z](?:[a-z\d-]{0,61}[a-z\d])?(?::\d{1,5})?(?:[/?#]|$)/i
const WWW_PREFIX_REGEX = /^www\./i

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

export type KnownSource = 'instagram' | 'tiktok'

export const getSourceLabel = (normalizedUrl: string): { known: KnownSource } | { host: string } => {
  const host = new URL(normalizedUrl).hostname.replace(WWW_PREFIX_REGEX, '')

  if (host === 'instagram.com' || host.endsWith('.instagram.com')) return { known: 'instagram' }
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return { known: 'tiktok' }

  return { host }
}

