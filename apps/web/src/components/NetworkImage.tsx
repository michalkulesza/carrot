import { useCallback, useState, type SyntheticEvent } from 'react'
import { PLACEHOLDER_URL } from '../utils/imageUtils'

type ImageState = 'loading' | 'loaded' | 'failed'

// Pages unmount on navigation; images already shown this session start visible
// instead of replaying the skeleton and fade-in when the page remounts.
const loadedSrcs = new Set<string>()

const initialState = (src: string | null | undefined): ImageState => {
  if (!src) return 'failed'

  return loadedSrcs.has(src) ? 'loaded' : 'loading'
}

interface NetworkImageProps {
  src: string | null | undefined
  alt: string
  className?: string
  imgClassName?: string
  onError?: (e: SyntheticEvent<HTMLImageElement>) => void
}

const NetworkImage = ({
  src,
  alt,
  className = '',
  imgClassName = '',
  onError,
}: NetworkImageProps) => {
  const [imageState, setImageState] = useState<ImageState>(() =>
    initialState(src)
  )
  const [prevSrc, setPrevSrc] = useState(src)

  // Reset during render rather than in an effect: a cached image can fire `load`
  // before effects flush, and an effect reset would then leave it hidden forever.
  if (src !== prevSrc) {
    setPrevSrc(src)
    setImageState(initialState(src))
  }

  const markLoaded = useCallback(() => {
    if (src) loadedSrcs.add(src)
    setImageState('loaded')
  }, [src])

  // Catch images that finished loading before React attached the listener.
  const imgRef = useCallback(
    (img: HTMLImageElement | null) => {
      if (img?.complete && img.naturalWidth > 0) markLoaded()
    },
    [markLoaded]
  )

  const handleError = useCallback(
    (e: SyntheticEvent<HTMLImageElement>) => {
      if (src) loadedSrcs.delete(src)
      setImageState('failed')
      onError?.(e)
    },
    [onError, src]
  )

  return (
    <div className={`relative overflow-hidden bg-zinc-100 ${className}`}>
      {imageState === 'loading' && (
        <div className="absolute inset-0 animate-pulse bg-zinc-200" />
      )}
      {imageState === 'failed' ? (
        <div className="absolute inset-0" role="img" aria-label={`Image unavailable for ${alt}`}>
          {PLACEHOLDER_URL ? (
            <img src={PLACEHOLDER_URL} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-zinc-200 dark:bg-zinc-700" />
          )}
        </div>
      ) : (
        <img
          ref={imgRef}
          src={src ?? undefined}
          alt={alt}
          onLoad={markLoaded}
          onError={handleError}
          className={`w-full h-full object-cover transition-opacity duration-300 ${imageState === 'loaded' ? 'opacity-100' : 'opacity-0'} ${imgClassName}`}
        />
      )}
    </div>
  )
}

export default NetworkImage
