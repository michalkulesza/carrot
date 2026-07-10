import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { Tag } from '@carrot/shared/types'
import { tTag } from '@carrot/shared/utils/tagUtils'

interface TagRowProps {
  tags: Tag[]
  allTags: Tag[]
  onAdd: (tag: Tag) => void
  onRemove: (tagId: string) => void
  onCreateTag?: (name: string) => Promise<Tag>
  editable?: boolean
}

interface TagPillProps {
  tag: Tag
  editable: boolean
  onRemove: (tagId: string) => void
}

const TagPill = ({ tag, editable, onRemove }: TagPillProps) => {
  const { t } = useTranslation()
  const label = tTag(tag.name, t)
  const handleRemove = useCallback(() => onRemove(tag.id), [onRemove, tag.id])

  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium px-2 py-0.5 rounded-full bg-secondary-100 border border-secondary-400 text-secondary-700">
      {label}
      {editable && (
        <button
          type="button"
          onClick={handleRemove}
          className="ml-0.5 leading-none text-secondary-400 hover:text-secondary-700 transition-colors"
          aria-label={t('tags.removeTag', { name: label })}
        >
          ×
        </button>
      )}
    </span>
  )
}

interface TagPickerProps {
  inputRef: React.RefObject<HTMLInputElement | null>
  search: string
  onSearchChange: (value: string) => void
  onSearchKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void
  filtered: Tag[]
  onSelectTag: (tag: Tag) => void
  canCreate: boolean
  creating: boolean
  onCreate: () => void
  trimmedSearch: string
  allTagsEmpty: boolean
}

const TagPicker = ({
  inputRef,
  search,
  onSearchChange,
  onSearchKeyDown,
  filtered,
  onSelectTag,
  canCreate,
  creating,
  onCreate,
  trimmedSearch,
  allTagsEmpty,
}: TagPickerProps) => {
  const { t } = useTranslation()
  const emptyStateLabel = allTagsEmpty
    ? t('tags.noTagsAvailable')
    : t('tags.allTagsAdded')

  return (
    <div className="absolute left-0 top-6 z-50 w-52 bg-white rounded-xl shadow-xl border border-zinc-200 overflow-hidden">
      <div className="px-3 py-2 border-b border-zinc-200">
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={onSearchKeyDown}
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
            onClick={() => onSelectTag(tag)}
          >
            {tTag(tag.name, t)}
          </button>
        ))}
        {canCreate && (
          <button
            type="button"
            disabled={creating}
            className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
            onClick={onCreate}
          >
            {creating
              ? t('tags.creating')
              : t('tags.createTag', { name: trimmedSearch })}
          </button>
        )}
        {filtered.length === 0 && !canCreate && (
          <p className="px-3 py-2 text-sm text-zinc-400">{emptyStateLabel}</p>
        )}
      </div>
    </div>
  )
}

const TagRow = ({
  tags,
  allTags,
  onAdd,
  onRemove,
  onCreateTag,
  editable = true,
}: TagRowProps) => {
  const { t } = useTranslation()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const trimmedSearch = search.trim()

  const available = useMemo(() => {
    const tagIds = new Set(tags.map((tag) => tag.id))

    return allTags.filter((tag) => !tagIds.has(tag.id))
  }, [tags, allTags])

  const filtered = useMemo(() => {
    if (!trimmedSearch) return available
    const query = trimmedSearch.toLowerCase()

    return available.filter((tag) => tag.name.toLowerCase().includes(query))
  }, [available, trimmedSearch])

  const canCreate = useMemo(() => {
    const exactMatch = allTags.some(
      (tag) => tag.name.toLowerCase() === trimmedSearch.toLowerCase()
    )

    return !!onCreateTag && trimmedSearch.length > 0 && !exactMatch
  }, [allTags, onCreateTag, trimmedSearch])

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

  const handleAddTag = useCallback(
    (tag: Tag) => {
      onAdd(tag)
      setPickerOpen(false)
      setSearch('')
    },
    [onAdd]
  )

  const handleCreate = useCallback(async () => {
    if (!onCreateTag || !trimmedSearch) return
    setCreating(true)
    try {
      const tag = await onCreateTag(trimmedSearch)
      handleAddTag(tag)
    } finally {
      setCreating(false)
    }
  }, [onCreateTag, trimmedSearch, handleAddTag])

  const handleSearchKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        setPickerOpen(false)
        setSearch('')
      }
      if (e.key === 'Enter') {
        if (filtered.length === 1) handleAddTag(filtered[0])
        else if (canCreate) handleCreate()
      }
    },
    [filtered, canCreate, handleAddTag, handleCreate]
  )

  const togglePicker = useCallback(() => setPickerOpen((open) => !open), [])

  return (
    <div className="flex flex-wrap gap-1.5 items-center" ref={containerRef}>
      {tags.length === 0 && (
        <span className="text-xs text-zinc-400 italic">{t('tags.noTags')}</span>
      )}
      {tags.map((tag) => (
        <TagPill
          key={tag.id}
          tag={tag}
          editable={editable}
          onRemove={onRemove}
        />
      ))}

      {editable && (
        <div className="relative">
          <button
            type="button"
            onClick={togglePicker}
            className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-zinc-200 hover:bg-zinc-300 text-zinc-600 text-xs font-bold transition-colors"
            aria-label={t('tags.addTag')}
          >
            +
          </button>

          {pickerOpen && (
            <TagPicker
              inputRef={inputRef}
              search={search}
              onSearchChange={setSearch}
              onSearchKeyDown={handleSearchKeyDown}
              filtered={filtered}
              onSelectTag={handleAddTag}
              canCreate={canCreate}
              creating={creating}
              onCreate={handleCreate}
              trimmedSearch={trimmedSearch}
              allTagsEmpty={allTags.length === 0}
            />
          )}
        </div>
      )}
    </div>
  )
}

export default TagRow
