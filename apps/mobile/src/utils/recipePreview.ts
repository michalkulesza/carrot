import { fetch as expoFetch } from 'expo/fetch'

const IMAGE_META_PATTERNS = [
  /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i,
]
const HEAD_END = '</head>'

const readHead = async (response: Awaited<ReturnType<typeof expoFetch>>): Promise<string> => {
  const reader = response.body?.getReader()
  if (!reader) return response.text()

  const decoder = new TextDecoder()
  let html = ''

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break

      html += decoder.decode(value, { stream: true })
      if (html.toLowerCase().includes(HEAD_END)) break
    }
  } finally {
    void reader.cancel().catch(() => undefined)
  }

  return html
}

export const resolveRecipePreview = async (url: string): Promise<string | null> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5_000)

  try {
    const response = await expoFetch(url, { signal: controller.signal })
    if (!response.ok) return null

    const html = await readHead(response)
    const imageUrl = IMAGE_META_PATTERNS.map((pattern) => html.match(pattern)?.[1]).find(Boolean)
    return imageUrl ? new URL(imageUrl, response.url).href : null
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}
