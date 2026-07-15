const IMAGE_META_PATTERNS = [
  /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i,
]

export const resolveRecipePreview = async (url: string): Promise<string | null> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5_000)

  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) return null

    const html = await response.text()
    const imageUrl = IMAGE_META_PATTERNS.map((pattern) => html.match(pattern)?.[1]).find(Boolean)
    return imageUrl ? new URL(imageUrl, response.url).href : null
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}
