import { useCallback, useMemo } from 'react'
import { Star } from 'react-feather'
import { useTranslation } from 'react-i18next'
import type { Tag } from '@carrot/shared/types'
import { tTag } from '@carrot/shared/utils/tagUtils'
import { TAG_CATEGORIES, groupTagsByCategory } from '@carrot/shared/utils/tagFilters'
import CategoryFilterDropdown from './CategoryFilterDropdown'

interface FilterBarProps {
  allTags: Tag[]
  filterFavourites: boolean
  onToggleFilterFavourites: () => void
  selectedTagIds: Set<string>
  onToggleTag: (tagId: string) => void
}

const FilterBar = ({
  allTags,
  filterFavourites,
  onToggleFilterFavourites,
  selectedTagIds,
  onToggleTag,
}: FilterBarProps) => {
  const { t } = useTranslation()

  const groupedTags = useMemo(() => groupTagsByCategory(allTags), [allTags])

  const favouritesButtonClass = filterFavourites
    ? 'shrink-0 flex items-center justify-center w-8 h-8 rounded-full transition-colors bg-amber-400 text-white'
    : 'shrink-0 flex items-center justify-center w-8 h-8 rounded-full transition-colors bg-zinc-100 text-zinc-600 hover:bg-zinc-200'

  return (
    <div className="flex flex-col md:flex-row md:items-center gap-2 px-4 mt-3 pb-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleFilterFavourites}
          className={favouritesButtonClass}
          aria-label={t('recipes.filterFavourites')}
        >
          <Star size={13} fill="currentColor" aria-hidden={true} />
        </button>

        {TAG_CATEGORIES.map((category) => (
          <CategoryFilterDropdown
            key={category}
            category={category}
            tags={groupedTags[category]}
            selectedTagIds={selectedTagIds}
            onToggleTag={onToggleTag}
          />
        ))}
      </div>

      {groupedTags.other.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide md:flex-1 md:min-w-0">
          {groupedTags.other.map((tag) => (
            <FilterTagButton
              key={tag.id}
              tag={tag}
              active={selectedTagIds.has(tag.id)}
              onToggleTag={onToggleTag}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface FilterTagButtonProps {
  tag: Tag
  active: boolean
  onToggleTag: (tagId: string) => void
}

const FilterTagButton = ({
  tag,
  active,
  onToggleTag,
}: FilterTagButtonProps) => {
  const { t } = useTranslation()

  const handleClick = useCallback(() => {
    onToggleTag(tag.id)
  }, [tag, onToggleTag])

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
