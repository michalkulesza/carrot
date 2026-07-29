import { useCallback, useEffect, useState, type SyntheticEvent } from 'react'
import { PLACEHOLDER_URL } from '../utils/imageUtils'

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
  const [imageState, setImageState] = useState<'loading' | 'loaded' | 'failed'>(src ? 'loading' : 'failed')

  useEffect(() => setImageState(src ? 'loading' : 'failed'), [src])

  const handleLoad = useCallback(() => setImageState('loaded'), [])

  const handleError = useCallback(
    (e: SyntheticEvent<HTMLImageElement>) => {
      setImageState('failed')
      onError?.(e)
    },
    [onError]
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
          src={src ?? undefined}
          alt={alt}
          onLoad={handleLoad}
          onError={handleError}
          className={`w-full h-full object-cover transition-opacity duration-300 ${imageState === 'loaded' ? 'opacity-100' : 'opacity-0'} ${imgClassName}`}
        />
      )}
    </div>
  )
}

export default NetworkImage
