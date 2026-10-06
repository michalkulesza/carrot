import { proxyUrl } from '../../utils/imageUtils'
import NetworkImage from '../NetworkImage'

interface ThumbCellProps {
  url: string | null
  title: string
}

const ThumbCell = ({ url, title }: ThumbCellProps) => {
  const proxied = proxyUrl(url)

  if (!proxied) {
    return (
      <div className="w-14 h-14 rounded-[10px] overflow-hidden bg-mist shrink-0 flex items-center justify-center text-ink-ghost text-xl">
        🍽
      </div>
    )
  }

  return (
    <NetworkImage
      src={proxied}
      alt={title}
      className="w-14 h-14 rounded-[10px] shrink-0"
    />
  )
}

export default ThumbCell
