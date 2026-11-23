// Must stay in sync with _UNSUPPORTED_SOCIAL_SUFFIXES in services/api/src/api/services/extraction_v2/production.py.
const UNSUPPORTED_HOST_SUFFIXES = [
  'facebook.com',
  'fb.watch',
  'youtube.com',
  'youtu.be',
  'pinterest.com',
  'x.com',
  'twitter.com',
  'snapchat.com',
]

const parseHttpUrl = (value: string): URL | null => {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed : null
  } catch {
    return null
  }
}

export const extractSingleUrl = (text: string): string | null => {
  const trimmed = text.trim()
  if (!trimmed || /\s/.test(trimmed)) return null

  return parseHttpUrl(trimmed) ? trimmed : null
}

export const isUnsupportedImportUrl = (url: string): boolean => {
  const parsed = parseHttpUrl(url.trim())
  if (!parsed) return false

  const host = parsed.hostname.toLowerCase().replace(/\.$/, '')

  return UNSUPPORTED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
}
