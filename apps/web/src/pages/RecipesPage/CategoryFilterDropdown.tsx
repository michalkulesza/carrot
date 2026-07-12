import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'react-feather'
import { useTranslation } from 'react-i18next'
import type { Tag, TagCategory } from '@carrot/shared/types'
import { tTag } from '@carrot/shared/utils/tagUtils'

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
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)

    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const togglePanel = useCallback(() => setOpen((v) => !v), [])

  const selectedTags = tags.filter((tag) => selectedTagIds.has(tag.id))
  const isActive = selectedTags.length > 0
  const label = isActive
    ? selectedTags.length > 1
      ? `${tTag(selectedTags[0].name, t)} +${selectedTags.length - 1}`
      : tTag(selectedTags[0].name, t)
    : t(`tags.category.${category}`)

  const buttonClass = isActive
    ? 'flex-1 min-w-0 flex items-center justify-between gap-1 text-xs font-medium px-3 py-1.5 rounded-full transition-colors bg-secondary text-white'
    : 'flex-1 min-w-0 flex items-center justify-between gap-1 text-xs font-medium px-3 py-1.5 rounded-full transition-colors bg-zinc-100 text-zinc-600 hover:bg-zinc-200'

  return (
    <div className="relative flex-1 min-w-0" ref={containerRef}>
      <button type="button" onClick={togglePanel} className={buttonClass}>
        <span className="truncate">{label}</span>
        <ChevronDown size={12} aria-hidden={true} />
      </button>
      {open && (
        <div className="absolute left-0 top-8 z-50 w-48 bg-white rounded-xl shadow-xl border border-zinc-200 overflow-hidden max-h-56 overflow-y-auto">
          {tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => onToggleTag(tag.id)}
              className="w-full flex items-center justify-between text-left px-3 py-2 text-sm hover:bg-zinc-100 transition-colors"
            >
              {tTag(tag.name, t)}
              {selectedTagIds.has(tag.id) && <span className="text-primary">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default CategoryFilterDropdown
