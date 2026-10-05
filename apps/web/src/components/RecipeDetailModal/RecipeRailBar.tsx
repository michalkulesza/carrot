import { useTranslation } from 'react-i18next'
import { proxyUrl } from '../../utils/imageUtils'
import NetworkImage from '../NetworkImage'

interface RecipeRailBarProps {
  title: string
  thumbnailUrl: string | null
  visible: boolean
  onBackToTop: () => void
  className?: string
}

// Zero-height sticky wrapper so the bar overlays the rail without taking
// space; callers cancel any rail padding/gap via className.
const RecipeRailBar = ({
  title,
  thumbnailUrl,
  visible,
  onBackToTop,
  className = '',
}: RecipeRailBarProps) => {
  const { t } = useTranslation()
  const thumbnail = proxyUrl(thumbnailUrl)

  return (
    <div className={`sticky top-0 z-10 h-0 shrink-0 ${className}`}>
      <button
        type="button"
        onClick={onBackToTop}
        aria-label={t('recipes.backToTop')}
        tabIndex={visible ? 0 : -1}
        className={`absolute inset-x-0 top-0 flex items-center gap-2.5 border-b border-[#ECEAF0] bg-white/95 py-2.5 pl-3.5 pr-3 text-left shadow-[0_6px_16px_rgba(31,29,43,0.06)] transition-[opacity,transform] duration-200 ${
          visible
            ? 'translate-y-0 opacity-100'
            : 'pointer-events-none -translate-y-2 opacity-0'
        }`}
      >
        <span className="h-9 w-9 shrink-0 overflow-hidden rounded-[9px] bg-[#EDE7E0]">
          {thumbnail && (
            <NetworkImage
              src={thumbnail}
              alt=""
              className="h-full w-full object-cover"
            />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold">
          {title || t('recipes.recipeNamePlaceholder')}
        </span>
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-[#F4F3F7] text-[#6B6A78]">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="m6 15 6-6 6 6" />
          </svg>
        </span>
      </button>
    </div>
  )
}

export default RecipeRailBar
