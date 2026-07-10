import { useState } from 'react'
import { proxyUrl } from '../../utils/imageUtils'

interface ThumbCellProps {
  url: string | null
  title: string
}

const ThumbCell = ({ url, title }: ThumbCellProps) => {
  const [loaded, setLoaded] = useState(false)
  const proxied = proxyUrl(url)
  const imgClassName = `w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`

  return (
    <div className="w-12 h-12 rounded-lg overflow-hidden bg-zinc-100 shrink-0 relative">
      {!loaded && proxied && (
        <div className="absolute inset-0 animate-pulse bg-zinc-200" />
      )}
      {proxied ? (
        <img
          src={proxied}
          alt={title}
          onLoad={() => setLoaded(true)}
          className={imgClassName}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-zinc-200 text-xl">
          🍽
        </div>
      )}
    </div>
  )
}

export default ThumbCell
