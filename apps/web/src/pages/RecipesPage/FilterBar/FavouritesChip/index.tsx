import { Star } from 'react-feather'
import { useTranslation } from 'react-i18next'

interface FavouritesChipProps {
  active: boolean
  onToggle: () => void
}

const FavouritesChip = ({ active, onToggle }: FavouritesChipProps) => {
  const { t } = useTranslation()
  const label = t('recipes.filterFavourites')
  const stateClass = active
    ? 'border-carrot text-carrot-strong'
    : 'border-line text-ink-soft hover:border-line-strong'

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-pressed={active}
      className={`shrink-0 flex items-center justify-center gap-1.5 rounded-[10px] border bg-white px-2 py-1.5 text-sm font-bold transition-colors md:px-3 md:py-2 ${stateClass}`}
    >
      <Star
        size={14}
        fill={active ? 'currentColor' : 'none'}
        aria-hidden={true}
      />
      <span className="hidden md:inline">{label}</span>
    </button>
  )
}

export default FavouritesChip
