import { useCallback } from 'react'
import { Star } from 'react-feather'
import { useTranslation } from 'react-i18next'
import type { Tag } from '@carrot/shared/types'
import { tTag } from '@carrot/shared/utils/tagUtils'

interface FilterBarProps {
  allTags: Tag[]
  filterFavourites: boolean
  onToggleFilterFavourites: () => void
  filterTag: Tag | null
  onSelectFilterTag: (tag: Tag | null) => void
}

const FilterBar = ({
  allTags,
  filterFavourites,
  onToggleFilterFavourites,
  filterTag,
  onSelectFilterTag,
}: FilterBarProps) => {
  const { t } = useTranslation()

  const favouritesButtonClass = filterFavourites
    ? 'shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-colors bg-amber-400 text-white'
    : 'shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-colors bg-zinc-100 text-zinc-600 hover:bg-zinc-200'

  return (
    <div className="flex items-center gap-2 px-4 mt-3 pb-1">
      <button
        type="button"
        onClick={onToggleFilterFavourites}
        className={favouritesButtonClass}
      >
        <Star size={11} fill="currentColor" aria-hidden={true} />
        {t('recipes.filterFavourites')}
      </button>

      {allTags.length > 0 && (
        <>
          <div className="shrink-0 w-px h-4 bg-zinc-200 self-center" />
          <div className="flex gap-2 overflow-x-auto scrollbar-hide min-w-0">
            {allTags.map((tag) => (
              <FilterTagButton
                key={tag.id}
                tag={tag}
                active={filterTag?.id === tag.id}
                onSelectFilterTag={onSelectFilterTag}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

interface FilterTagButtonProps {
  tag: Tag
  active: boolean
  onSelectFilterTag: (tag: Tag | null) => void
}

const FilterTagButton = ({
  tag,
  active,
  onSelectFilterTag,
}: FilterTagButtonProps) => {
  const { t } = useTranslation()

  const handleClick = useCallback(() => {
    onSelectFilterTag(active ? null : tag)
  }, [active, tag, onSelectFilterTag])

  const buttonClass = active
    ? 'shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors bg-secondary text-white'
    : 'shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors bg-zinc-100 text-zinc-600 hover:bg-zinc-200'

  return (
    <button type="button" onClick={handleClick} className={buttonClass}>
      {tTag(tag.name, t)}
    </button>
  )
}

export default FilterBar
