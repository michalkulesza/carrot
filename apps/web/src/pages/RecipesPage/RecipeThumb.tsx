import { useState } from 'react'

interface RecipeThumbProps {
  src: string
  alt: string
}

const RecipeThumb = ({ src, alt }: RecipeThumbProps) => {
  const [loaded, setLoaded] = useState(false)

  return (
    <div className="w-16 h-16 rounded-lg shrink-0 overflow-hidden bg-zinc-100 relative">
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
