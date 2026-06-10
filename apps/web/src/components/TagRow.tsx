import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Tag } from '@platekeeper/shared/types'
import { tTag } from '@platekeeper/shared/utils/tagUtils'

interface TagRowProps {
  tags: Tag[]
  allTags: Tag[]
  onAdd: (tag: Tag) => void
  onRemove: (tagId: string) => void
  onCreateTag?: (name: string) => Promise<Tag>
}

const TagRow = ({
  tags,
  allTags,
  onAdd,
  onRemove,
  onCreateTag,
}: TagRowProps) => {
  const { t } = useTranslation()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const tagSet = new Set(tags.map((t) => t.id))
  const available = allTags.filter((t) => !tagSet.has(t.id))
  const filtered = search.trim()
    ? available.filter((t) =>
        t.name.toLowerCase().includes(search.toLowerCase())
      )
    : available
  const trimmedSearch = search.trim()
  const exactMatch = allTags.some(
    (t) => t.name.toLowerCase() === trimmedSearch.toLowerCase()
  )
  const canCreate = !!onCreateTag && trimmedSearch.length > 0 && !exactMatch

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setPickerOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)

    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (pickerOpen) inputRef.current?.focus()
  }, [pickerOpen])

  const handleCreate = async () => {
    if (!onCreateTag || !trimmedSearch) return
    setCreating(true)
    try {
      const tag = await onCreateTag(trimmedSearch)
      onAdd(tag)
      setSearch('')
      setPickerOpen(false)
    } finally {
      setCreating(false)
    }
  }

  const handleAddTag = (tag: Tag) => {
    onAdd(tag)
    setPickerOpen(false)
    setSearch('')
  }

  return (
    <div className="flex flex-wrap gap-1.5 items-center" ref={containerRef}>
      {tags.length === 0 && (
        <span className="text-xs text-zinc-400 italic">{t('tags.noTags')}</span>
      )}
      {tags.map((tag) => (
        <span
          key={tag.id}
          className="inline-flex items-center gap-0.5 text-xs font-medium px-2 py-0.5 rounded-full bg-secondary/15 text-secondary-700"
        >
          {tTag(tag.name, t)}
          <button
            type="button"
            onClick={() => onRemove(tag.id)}
            className="ml-0.5 leading-none text-secondary-400 hover:text-secondary-700 transition-colors"
            aria-label={`Remove ${tTag(tag.name, t)}`}
          >
            ×
          </button>
        </span>
      ))}

      <div className="relative">
        <button
          type="button"
          onClick={() => setPickerOpen((o) => !o)}
          className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-zinc-200 hover:bg-zinc-300 text-zinc-600 text-xs font-bold transition-colors"
          aria-label="Add tag"
        >
          +
        </button>

        {pickerOpen && (
          <div className="absolute left-0 top-6 z-50 w-52 bg-white rounded-xl shadow-xl border border-zinc-200 overflow-hidden">
            <div className="px-3 py-2 border-b border-zinc-200">
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setPickerOpen(false)
                    setSearch('')
                  }
                  if (e.key === 'Enter') {
                    if (filtered.length === 1) handleAddTag(filtered[0])
                    else if (canCreate) handleCreate()
                  }
                }}
                placeholder={t('tags.searchOrCreate')}
                className="w-full text-sm bg-transparent focus:outline-none placeholder-zinc-400"
              />
            </div>
            <div className="max-h-44 overflow-y-auto">
              {filtered.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-100 transition-colors"
                  onClick={() => handleAddTag(tag)}
                >
                  {tTag(tag.name, t)}
                </button>
              ))}
              {canCreate && (
                <button
                  type="button"
                  disabled={creating}
                  className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
                  onClick={handleCreate}
                >
                  {creating
                    ? t('tags.creating')
                    : t('tags.createTag', { name: trimmedSearch })}
                </button>
              )}
              {filtered.length === 0 && !canCreate && (
                <p className="px-3 py-2 text-sm text-zinc-400">
                  {allTags.length === 0
                    ? t('tags.noTagsAvailable')
                    : t('tags.allTagsAdded')}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default TagRow
