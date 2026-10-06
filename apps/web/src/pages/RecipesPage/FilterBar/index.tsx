import { useTranslation } from 'react-i18next'
import type { Tag } from '@carrot/shared/types'
import {
  groupTagsByCategory,
  TAG_CATEGORIES,
} from '@carrot/shared/utils/tagFilters'
import CategoryFilterDropdown from './CategoryFilterDropdown'
import FavouritesChip from './FavouritesChip'
import HorizontalScrollStrip from './HorizontalScrollStrip'
import TagPills from './TagPills'

interface FilterBarProps {
  allTags: Tag[]
  filterFavourites: boolean
  onToggleFilterFavourites: () => void
  selectedTagIds: Set<string>
  onToggleTag: (tagId: string) => void
  shownCount: number
  totalCount: number
  onClearAll: () => void
}

const FilterBar = ({
  allTags,
  filterFavourites,
  onToggleFilterFavourites,
  selectedTagIds,
  onToggleTag,
  shownCount,
  totalCount,
  onClearAll,
}: FilterBarProps) => {
  const { t } = useTranslation()
  const groupedTags = groupTagsByCategory(allTags)
  const hasActiveFilters = filterFavourites || selectedTagIds.size > 0
  const hasOtherTags = groupedTags.other.length > 0

  return (
    <div className="mt-3 bg-toolbar font-nunito text-ink-soft md:mt-0">
      <div className="flex items-center gap-2 px-4 py-3 md:gap-2.5 md:px-[22px]">
        <FavouritesChip
          active={filterFavourites}
          onToggle={onToggleFilterFavourites}
        />

        {TAG_CATEGORIES.map((category) => (
          <CategoryFilterDropdown
            key={category}
            category={category}
            tags={groupedTags[category]}
            selectedTagIds={selectedTagIds}
            onToggleTag={onToggleTag}
          />
        ))}

        <div className="ml-auto hidden shrink-0 items-center gap-3.5 text-sm font-bold md:flex">
          <span className="text-ink-subtle">
            {t('recipes.shownOfTotal', {
              shown: shownCount,
              total: totalCount,
            })}
          </span>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onClearAll}
              className="font-extrabold text-carrot-strong transition-colors hover:text-carrot-hover"
            >
              {t('recipes.clearAll')}
            </button>
          )}
        </div>
      </div>

      {hasOtherTags && (
        <div className="border-b border-line pb-3 md:px-[22px] md:pb-3.5 md:pt-0.5">
          <div className="px-4 md:hidden">
            <HorizontalScrollStrip>
              <TagPills
                tags={groupedTags.other}
                selectedTagIds={selectedTagIds}
                onToggleTag={onToggleTag}
              />
            </HorizontalScrollStrip>
          </div>
          <div className="hidden flex-wrap items-center gap-1.5 md:flex">
            <span className="mr-1.5 text-[11px] font-extrabold uppercase tracking-[.08em] text-ink-subtle">
              {t('tags.tags')}
            </span>
            <TagPills
              tags={groupedTags.other}
              selectedTagIds={selectedTagIds}
              onToggleTag={onToggleTag}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default FilterBar
