const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? ''
const R2_PUBLIC_URL = process.env.EXPO_PUBLIC_R2_PUBLIC_URL ?? ''

export const PLACEHOLDER_URL = R2_PUBLIC_URL
  ? `${R2_PUBLIC_URL.replace(/\/$/, '')}/catering-item-placeholder-704x520.png`
  : ''

export const isR2Url = (url: string): boolean =>
  R2_PUBLIC_URL !== '' && url.startsWith(R2_PUBLIC_URL)

export const proxyThumbnailUrl = (url: string | null | undefined): string | null => {
  // Keep recipes imported before thumbnail storage was added visually complete
  // without needing to backfill their database rows.
  if (!url) return PLACEHOLDER_URL || null
  if (url.startsWith(API_BASE)) return url
  if (isR2Url(url)) return url
  return `${API_BASE}/api/proxy/image?url=${encodeURIComponent(url)}`
}

const SMALL_WIDTH = 400
const R2_THUMBNAIL_EXTENSION = /^(.*\/thumbnails\/[^?#]*)(\.[A-Za-z0-9]+)([?#].*)?$/

export const smallThumbnailUrl = (url: string | null | undefined): string | null => {
  if (!url) return PLACEHOLDER_URL || null
  if (isR2Url(url)) {
    const match = R2_THUMBNAIL_EXTENSION.exec(url)
    return match ? `${match[1]}_sm${match[2]}${match[3] ?? ''}` : url
  }
  if (url.startsWith(API_BASE)) return url.includes('/api/proxy/image') ? `${url}&w=${SMALL_WIDTH}` : url
  return `${API_BASE}/api/proxy/image?url=${encodeURIComponent(url)}&w=${SMALL_WIDTH}`
}
