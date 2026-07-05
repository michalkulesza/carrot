const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? ''
const R2_PUBLIC_URL = process.env.EXPO_PUBLIC_R2_PUBLIC_URL ?? ''

export const PLACEHOLDER_URL = R2_PUBLIC_URL
  ? `${R2_PUBLIC_URL.replace(/\/$/, '')}/catering-item-placeholder-704x520.png`
  : ''

export const isR2Url = (url: string): boolean =>
  R2_PUBLIC_URL !== '' && url.startsWith(R2_PUBLIC_URL)

export const proxyThumbnailUrl = (url: string | null | undefined): string | null => {
  if (!url) return null
  if (url.startsWith(API_BASE)) return url
  if (isR2Url(url)) return url
  return `${API_BASE}/api/proxy/image?url=${encodeURIComponent(url)}`
}
