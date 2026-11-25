import { useCallback, useMemo, useRef, useState } from 'react'
import { Alert } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { Tag } from '@carrot/shared/types'
import { tTag } from '@carrot/shared/utils/tagUtils'
import { TAG_CATEGORIES, groupTagsByCategory } from '@carrot/shared/utils/tagFilters'
import { CreateRow, SelectionChip, SelectionDrawer, SelectionRow, useDrawerSearch } from './SelectionDrawer'
import type { DrawerSection } from './SelectionDrawer'

interface TagPickerModalProps {
  visible: boolean
  allTags: Tag[]
  selectedIds: Set<string>
  onAdd: (tag: Tag) => void
  onRemove: (tagId: string) => void
  onCreate: (name: string) => Promise<Tag>
  onClose: () => void
}

interface SelectedTagChipProps {
  tag: Tag
  onRemove: (tagId: string) => void
}

const SelectedTagChip = ({ tag, onRemove }: SelectedTagChipProps) => {
  const { t } = useTranslation()

  const handleRemove = useCallback(() => onRemove(tag.id), [onRemove, tag.id])

  return (
    <SelectionChip
      label={tTag(tag.name, t)}
      removeLabel={t('tags.removeTag', { name: tTag(tag.name, t) })}
      onRemove={handleRemove}
    />
  )
}

const getTagKey = (tag: Tag) => tag.id

export const TagPickerModal = ({
  visible,
  allTags,
  selectedIds,
  onAdd,
  onRemove,
  onCreate,
  onClose,
}: TagPickerModalProps) => {
  const { t } = useTranslation()
  const { query, setQuery, trimmed, normalized } = useDrawerSearch()
  const [creating, setCreating] = useState(false)
  const creatingRef = useRef(false)

  const filtered = useMemo(
    () => allTags.filter((tag) => !normalized || tag.name.toLowerCase().includes(normalized)),
    [allTags, normalized],
  )

  const sections = useMemo<DrawerSection<Tag>[]>(() => {
    const grouped = groupTagsByCategory(filtered)
    const selectedFirst = (tags: Tag[]) =>
      [...tags].sort((a, b) => Number(selectedIds.has(b.id)) - Number(selectedIds.has(a.id)))

    return [
      ...TAG_CATEGORIES.map((category) => ({
        key: category,
        title: t(`tags.category.${category}`),
        data: selectedFirst(grouped[category]),
      })),
      { key: 'other', title: t('tags.category.other'), data: selectedFirst(grouped.other) },
    ].filter((section) => section.data.length > 0)
  }, [filtered, t, selectedIds])

  const selectedTags = useMemo(() => allTags.filter((tag) => selectedIds.has(tag.id)), [allTags, selectedIds])

  const canCreate = trimmed.length > 0 && !allTags.some((tag) => tag.name.toLowerCase() === normalized)

  const handleCreate = useCallback(async () => {
    if (creatingRef.current) return
    creatingRef.current = true
    setCreating(true)

    try {
      const tag = await onCreate(trimmed)
      onAdd(tag)
      setQuery('')
    } catch {
      Alert.alert(t('common.somethingWentWrong'), t('addRecipe.saveError'))
    } finally {
      creatingRef.current = false
      setCreating(false)
    }
  }, [onAdd, onCreate, trimmed, setQuery, t])

  const handleToggle = useCallback(
    (tagId: string) => {
      if (selectedIds.has(tagId)) {
        onRemove(tagId)
        return
      }

      const tag = allTags.find((candidate) => candidate.id === tagId)

      if (tag) onAdd(tag)
    },
    [selectedIds, allTags, onAdd, onRemove],
  )

  const renderItem = useCallback(
    (tag: Tag) => (
      <SelectionRow id={tag.id} title={tTag(tag.name, t)} selected={selectedIds.has(tag.id)} onToggle={handleToggle} />
    ),
    [selectedIds, handleToggle, t],
  )

  const chips = useMemo(
    () =>
      selectedTags.length > 0
        ? selectedTags.map((tag) => <SelectedTagChip key={tag.id} tag={tag} onRemove={onRemove} />)
        : null,
    [selectedTags, onRemove],
  )

  const listHeader = canCreate ? (
    <CreateRow
      label={creating ? t('tags.creating') : t('tags.createTagLabel')}
      query={creating ? undefined : trimmed}
      disabled={creating}
      accessibilityLabel={t('tags.createTag', { name: trimmed })}
      onPress={handleCreate}
    />
  ) : null

  const emptyLabel = canCreate ? null : t('tags.noMatchingTags')

  const search = useMemo(
    () => ({ value: query, onChange: setQuery, placeholder: t('tags.searchOrCreateTag') }),
    [query, setQuery, t],
  )

  return (
    <SelectionDrawer<Tag>
      visible={visible}
      onDismiss={onClose}
      title={t('tags.editTags')}
      countLabel={t('selectionDrawer.selectedCount', { count: selectedIds.size })}
      search={search}
      chips={chips}
      listHeader={listHeader}
      sections={sections}
      renderItem={renderItem}
      keyExtractor={getTagKey}
      emptyLabel={emptyLabel}
    />
  )
}
