import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { renderSheetBackdrop, sheetStyles } from './ui/sheet'
import { useTranslation } from 'react-i18next'
import type { Tag } from '@carrot/shared/types'
import { tTag } from '@carrot/shared/utils/tagUtils'
import { TAG_CATEGORIES, groupTagsByCategory } from '@carrot/shared/utils/tagFilters'
import { palette, radius, typography } from '../theme'
import {
  PICKER_SNAP_POINTS,
  PickerChip,
  PickerChipRow,
  PickerEmpty,
  PickerHeader,
  PickerSearchField,
  pickerStyles,
} from './PickerSheetParts'
import { CheckboxCircle } from './ui'
import { lightHaptic } from './ui/haptics'

interface TagPickerModalProps {
  visible: boolean
  allTags: Tag[]
  selectedIds: Set<string>
  onAdd: (tag: Tag) => void
  onRemove: (tagId: string) => void
  onCreate: (name: string) => Promise<Tag>
  onClose: () => void
}

interface CreateTagRowProps {
  query: string
  creating: boolean
  onPress: () => void
}

const CreateTagRow = ({ query, creating, onPress }: CreateTagRowProps) => {
  const { t } = useTranslation()

  const label = creating ? t('tags.creating') : t('tags.createTagLabel')

  return (
    <Pressable
      style={styles.createRow}
      onPress={onPress}
      disabled={creating}
      accessibilityRole="button"
      accessibilityLabel={t('tags.createTag', { name: query })}
    >
      <View style={styles.createPlus}>
        <Text style={styles.createPlusGlyph}>+</Text>
      </View>
      <Text style={styles.createText} numberOfLines={1}>
        {label}
        {creating ? null : <Text style={styles.createQuery}>{` “${query}”`}</Text>}
      </Text>
    </Pressable>
  )
}

interface TagRowProps {
  tag: Tag
  selected: boolean
  onPress: (tag: Tag) => void
}

const TagRow = ({ tag, selected, onPress }: TagRowProps) => {
  const { t } = useTranslation()

  const handlePress = useCallback(() => {
    lightHaptic()
    onPress(tag)
  }, [onPress, tag])

  const labelStyle = selected ? styles.tagLabelSelected : styles.tagLabel

  return (
    <Pressable
      style={styles.tagRow}
      onPress={handlePress}
      accessibilityRole="checkbox"
      accessibilityLabel={tTag(tag.name, t)}
      accessibilityState={{ checked: selected }}
    >
      <Text style={labelStyle}>{tTag(tag.name, t)}</Text>
      <CheckboxCircle checked={selected} />
    </Pressable>
  )
}

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
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const sheetRef = useRef<BottomSheetModal>(null)
  const wasPresentedRef = useRef(false)
  const creatingRef = useRef(false)

  const trimmedQuery = query.trim()

  const filtered = useMemo(() => {
    const q = trimmedQuery.toLowerCase()

    return allTags.filter((tag) => !q || tag.name.toLowerCase().includes(q))
  }, [allTags, trimmedQuery])

  const groupedSections = useMemo(() => {
    const grouped = groupTagsByCategory(filtered)
    const selectedFirst = (tags: Tag[]) =>
      [...tags].sort((a, b) => Number(selectedIds.has(b.id)) - Number(selectedIds.has(a.id)))

    return [
      ...TAG_CATEGORIES.map((category) => ({
        key: category,
        title: t(`tags.category.${category}`),
        tags: selectedFirst(grouped[category]),
      })),
      { key: 'other', title: t('tags.category.other'), tags: selectedFirst(grouped.other) },
    ].filter((section) => section.tags.length > 0)
  }, [filtered, t, selectedIds])

  const selectedTags = useMemo(() => allTags.filter((tag) => selectedIds.has(tag.id)), [allTags, selectedIds])

  const canCreate =
    trimmedQuery.length > 0 && !allTags.some((tag) => tag.name.toLowerCase() === trimmedQuery.toLowerCase())

  const handleCreate = useCallback(async () => {
    if (creatingRef.current) return
    creatingRef.current = true
    setCreating(true)

    try {
      const tag = await onCreate(trimmedQuery)
      onAdd(tag)
      setQuery('')
    } catch {
      Alert.alert(t('common.somethingWentWrong'), t('addRecipe.saveError'))
    } finally {
      creatingRef.current = false
      setCreating(false)
    }
  }, [onAdd, onCreate, trimmedQuery, t])

  const handleTagRowPress = useCallback(
    (tag: Tag) => {
      if (selectedIds.has(tag.id)) {
        onRemove(tag.id)
        return
      }

      onAdd(tag)
    },
    [selectedIds, onAdd, onRemove],
  )

  useEffect(() => {
    if (visible) {
      wasPresentedRef.current = true
      sheetRef.current?.present()
    } else if (wasPresentedRef.current) {
      sheetRef.current?.dismiss()
    }
  }, [visible])

  const handleDismiss = useCallback(() => {
    wasPresentedRef.current = false
    setQuery('')
    onClose()
  }, [onClose])

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={PICKER_SNAP_POINTS}
      enableDynamicSizing={false}
      enablePanDownToClose
      onDismiss={handleDismiss}
      backdropComponent={renderSheetBackdrop}
      backgroundStyle={sheetStyles.background}
      handleIndicatorStyle={sheetStyles.handle}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
    >
      <PickerHeader countLabel={t('tags.selectedCount', { count: selectedIds.size })} title={t('tags.editTags')} />
      <PickerSearchField value={query} onChangeText={setQuery} placeholder={t('tags.searchOrCreateTag')} />
      {selectedTags.length > 0 ? (
        <PickerChipRow>
          {selectedTags.map((tag) => (
            <SelectedTagChip key={tag.id} tag={tag} onRemove={onRemove} />
          ))}
        </PickerChipRow>
      ) : null}
      <BottomSheetScrollView
        style={pickerStyles.list}
        contentContainerStyle={pickerStyles.listContent}
        keyboardShouldPersistTaps="handled"
      >
        {canCreate ? <CreateTagRow query={trimmedQuery} creating={creating} onPress={handleCreate} /> : null}
        {groupedSections.map((section) => (
          <View key={section.key}>
            <Text style={styles.sectionHeader}>{section.title}</Text>
            {section.tags.map((tag) => (
              <TagRow key={tag.id} tag={tag} selected={selectedIds.has(tag.id)} onPress={handleTagRowPress} />
            ))}
          </View>
        ))}
        {filtered.length === 0 && !canCreate ? <PickerEmpty label={t('tags.noMatchingTags')} /> : null}
      </BottomSheetScrollView>
    </BottomSheetModal>
  )
}

const SelectedTagChip = ({ tag, onRemove }: { tag: Tag; onRemove: (tagId: string) => void }) => {
  const { t } = useTranslation()

  const handleRemove = useCallback(() => onRemove(tag.id), [onRemove, tag.id])

  return (
    <PickerChip
      label={tTag(tag.name, t)}
      removeLabel={t('tags.removeTag', { name: tTag(tag.name, t) })}
      onRemove={handleRemove}
    />
  )
}

const styles = StyleSheet.create({
  createRow: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
    paddingHorizontal: 12,
    borderRadius: radius.control,
    backgroundColor: palette.tint,
  },
  createPlus: {
    width: 26,
    height: 26,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.action,
  },
  createPlusGlyph: { fontSize: 18, lineHeight: 22, fontWeight: '600', color: palette.onAction },
  createText: { flex: 1, ...typography.bodyLarge, color: palette.noteText },
  createQuery: { fontWeight: '700' },
  sectionHeader: {
    ...typography.caption,
    color: palette.textTertiary,
    paddingTop: 20,
    paddingBottom: 4,
  },
  tagRow: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...pickerStyles.rowDivider,
  },
  tagLabel: { ...typography.bodyLarge, color: palette.ink },
  tagLabelSelected: { ...typography.bodyLarge, fontWeight: '600', color: palette.ink },
})
