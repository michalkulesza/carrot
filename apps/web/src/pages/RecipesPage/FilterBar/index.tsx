import { Star } from 'react-feather'
import { useTranslation } from 'react-i18next'
import type { Tag } from '@carrot/shared/types'
import {
  groupTagsByCategory,
  TAG_CATEGORIES,
} from '@carrot/shared/utils/tagFilters'
import CategoryFilterDropdown from './CategoryFilterDropdown'
import FilterTagButton from './FilterTagButton'

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
  const groupedTags = groupTagsByCategory(allTags)

  const favouritesButtonClass = filterFavourites
    ? 'shrink-0 flex items-center justify-center w-8 h-8 rounded-full transition-colors bg-amber-400 text-white'
    : 'shrink-0 flex items-center justify-center w-8 h-8 rounded-full transition-colors bg-zinc-100 text-zinc-600 hover:bg-zinc-200'

  return (
    <div className="flex flex-col gap-2 px-4 pb-1 mt-3 md:flex-row md:items-center md:px-6">
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

export default FilterBar
