import { useCallback, useState } from 'react'
import { FlatList, ListRenderItemInfo, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { PlatformColor } from 'react-native'
import type { Tag, TagCategory } from '@carrot/shared/types'
import { tTag } from '@carrot/shared/utils/tagUtils'
import GlassViewSafe from '../../components/GlassViewSafe'
import { colors } from '../../theme/colors'

const CategoryFilterChip = ({
  category,
  tags,
  selectedTagIds,
  onToggle,
}: {
  category: TagCategory
  tags: Tag[]
  selectedTagIds: Set<string>
  onToggle: (tagId: string) => void
}) => {
  const { t } = useTranslation()
  const [modalVisible, setModalVisible] = useState(false)

  const selectedTags = tags.filter((tag) => selectedTagIds.has(tag.id))
  const isActive = selectedTags.length > 0
  const label = isActive
    ? selectedTags.length > 1
      ? `${tTag(selectedTags[0].name, t)} +${selectedTags.length - 1}`
      : tTag(selectedTags[0].name, t)
    : t(`tags.category.${category}`)

  const handleOpen = useCallback(() => setModalVisible(true), [])
  const handleClose = useCallback(() => setModalVisible(false), [])

  const renderRow = useCallback(
    ({ item }: ListRenderItemInfo<Tag>) => {
      const isSelected = selectedTagIds.has(item.id)
      return (
        <Pressable
          style={styles.row}
          onPress={() => onToggle(item.id)}
          accessibilityLabel={item.name}
          accessibilityState={{ selected: isSelected }}
        >
          <Text style={styles.rowText}>{tTag(item.name, t)}</Text>
          {isSelected && <Text style={styles.rowCheck}>✓</Text>}
        </Pressable>
      )
    },
    [selectedTagIds, onToggle, t],
  )

  return (
    <>
      <Pressable
        onPress={handleOpen}
        style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
        accessibilityLabel={t(`tags.category.${category}`)}
        accessibilityRole="button"
        accessibilityState={{ selected: isActive }}
      >
        <GlassViewSafe
          style={StyleSheet.absoluteFill}
          glassEffectStyle={isActive ? 'clear' : 'regular'}
          tintColor={isActive ? colors.blue : colors.gray5}
        />
        <Text style={[styles.chipText, isActive && styles.chipTextSelected]} numberOfLines={1}>
          {label} ▾
        </Text>
      </Pressable>
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={handleClose}>
        <Pressable style={styles.overlay} onPress={handleClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{t(`tags.category.${category}`)}</Text>
          <FlatList data={tags} keyExtractor={(item) => item.id} renderItem={renderRow} />
        </View>
      </Modal>
    </>
  )
}

export default CategoryFilterChip

const styles = StyleSheet.create({
  chip: {
    flex: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  chipText: { fontSize: 13, color: colors.secondaryLabel, textAlign: 'center' },
  chipTextSelected: { color: '#ffffff', fontWeight: '600' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: PlatformColor('systemBackground') as unknown as string,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
    maxHeight: '60%',
    paddingBottom: 24,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: PlatformColor('opaqueSeparator') as unknown as string,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 8,
  },
  sheetTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
    color: PlatformColor('label') as unknown as string,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: PlatformColor('separator') as unknown as string,
  },
  rowText: { fontSize: 16, color: PlatformColor('secondaryLabel') as unknown as string },
  rowCheck: { fontSize: 16, color: colors.brand },
})
