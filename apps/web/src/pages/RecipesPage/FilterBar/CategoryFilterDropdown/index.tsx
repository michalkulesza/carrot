import { AnimatePresence } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'react-feather'
import { useTranslation } from 'react-i18next'
import type { Tag, TagCategory } from '@carrot/shared/types'
import { tTag } from '@carrot/shared/utils/tagUtils'
import PopupSurface from '../../../../components/PopupSurface'

interface CategoryFilterDropdownProps {
  category: TagCategory
  tags: Tag[]
  selectedTagIds: Set<string>
  onToggleTag: (tagId: string) => void
}

const CategoryFilterDropdown = ({
  category,
  tags,
  selectedTagIds,
  onToggleTag,
}: CategoryFilterDropdownProps) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)

    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  const selectedTags = tags.filter((tag) => selectedTagIds.has(tag.id))
  const isActive = selectedTags.length > 0
  const value = isActive
    ? selectedTags.length > 1
      ? `${tTag(selectedTags[0].name, t)} +${selectedTags.length - 1}`
      : tTag(selectedTags[0].name, t)
    : null
  const categoryName = t(`tags.category.${category}`)

  const buttonClass = isActive
    ? 'border-carrot'
    : 'border-line hover:border-line-strong'

  return (
    <div className="relative min-w-0 flex-1 md:flex-none" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((isOpen) => !isOpen)}
        aria-expanded={open}
        className={`flex w-full min-w-0 items-center justify-between gap-1 rounded-[10px] border bg-white px-2 py-1.5 text-xs font-bold transition-colors md:justify-start md:gap-2 md:px-3 md:py-2 md:text-sm ${buttonClass}`}
      >
        <span className="hidden text-ink-subtle md:inline">{categoryName}</span>
        {value ? (
          <span className="truncate text-carbs-ink">{value}</span>
        ) : (
          <>
            <span className="truncate md:hidden">{categoryName}</span>
            <span className="hidden md:inline">{t('recipes.filterAny')}</span>
          </>
        )}
        <ChevronDown
          size={14}
          className="shrink-0 text-ink-subtle"
          aria-hidden={true}
        />
      </button>
      <AnimatePresence>
        {open && (
          <PopupSurface className="absolute left-0 top-full mt-1 z-50 w-48 max-h-56 overflow-y-auto overflow-hidden bg-white border border-line rounded-xl shadow-xl font-nunito">
            {tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => onToggleTag(tag.id)}
                className="flex items-center justify-between w-full px-3 py-2 text-sm font-semibold text-ink-soft text-left transition-colors hover:bg-row-hover"
              >
                {tTag(tag.name, t)}
                {selectedTagIds.has(tag.id) && (
                  <span className="text-carrot-strong">✓</span>
                )}
              </button>
            ))}
          </PopupSurface>
        )}
      </AnimatePresence>
    </div>
  )
}

export default CategoryFilterDropdown
