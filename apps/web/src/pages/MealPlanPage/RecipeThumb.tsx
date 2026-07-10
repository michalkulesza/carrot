import { useState } from 'react'

interface RecipeThumbProps {
  src: string
  alt: string
  className?: string
}

const RecipeThumb = ({ src, alt, className = '' }: RecipeThumbProps) => {
  const [loaded, setLoaded] = useState(false)

  return (
    <div className={`relative overflow-hidden bg-zinc-100 ${className}`}>
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-zinc-200" />
      )}
      <img
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  )
}

export default RecipeThumb
