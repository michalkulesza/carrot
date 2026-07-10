const R2_PUBLIC_URL =
  (import.meta as unknown as { env: Record<string, string> }).env
    .VITE_R2_PUBLIC_URL ?? ''

export const PLACEHOLDER_URL = R2_PUBLIC_URL
  ? `${R2_PUBLIC_URL.replace(/\/$/, '')}/catering-item-placeholder-704x520.png`
  : ''

export const isR2Url = (url: string): boolean =>
  R2_PUBLIC_URL !== '' && url.startsWith(R2_PUBLIC_URL)

export const proxyUrl = (url: string | null | undefined): string | null => {
  if (!url) return null
  if (isR2Url(url)) return url

  return `/api/proxy/image?url=${encodeURIComponent(url)}`
}
