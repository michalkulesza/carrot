const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? ''

export const proxyThumbnailUrl = (url: string | null | undefined): string | null => {
  if (!url) return null
  if (url.startsWith(API_BASE)) return url
  return `${API_BASE}/proxy/image?url=${encodeURIComponent(url)}`
}
