import { useCallback, useMemo, useState } from 'react'
import NetworkImage from './NetworkImage'
import { proxyThumbnailUrl, smallThumbnailUrl, PLACEHOLDER_URL } from '../api/thumbnailUrl'

type ThumbnailSize = 'small' | 'full'

const buildUriChain = (url: string | null, size: ThumbnailSize) => {
  const candidates = [size === 'small' ? smallThumbnailUrl(url) : null, proxyThumbnailUrl(url), PLACEHOLDER_URL || null]
  const chain: string[] = []

  for (const candidate of candidates) {
    if (candidate && candidate !== chain[chain.length - 1]) chain.push(candidate)
  }

  return chain
}

const ThumbnailImage = ({
  url,
  style,
  size = 'full',
}: {
  url: string | null
  style: object
  size?: ThumbnailSize
}) => {
  const sourceKey = `${size}:${url ?? ''}`
  const [failures, setFailures] = useState({ sourceKey, count: 0 })
  const chain = useMemo(() => buildUriChain(url, size), [url, size])

  const failureCount = failures.sourceKey === sourceKey ? failures.count : 0
  const uri = chain[Math.min(failureCount, chain.length - 1)]

  const handleError = useCallback(
    () =>
      setFailures((prev) => ({ sourceKey, count: (prev.sourceKey === sourceKey ? prev.count : 0) + 1 })),
    [sourceKey],
  )

  if (!uri) return null

  return (
    <NetworkImage uri={uri} style={style} recyclingKey={url} fallbackToPlaceholder={false} onError={handleError} />
  )
}

export default ThumbnailImage
