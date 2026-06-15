const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? ''

export const isValidImageUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url.trim())
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

export const proxyThumbnailUrl = (url: string | null | undefined): string | null => {
  if (!url) return null
  if (url.startsWith(API_BASE)) return url
  return `${API_BASE}/proxy/image?url=${encodeURIComponent(url)}`
}
