import { useCallback, useMemo } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'
import { MenuView } from '@react-native-menu/menu'
import type { MenuAction, NativeActionEvent } from '@react-native-menu/menu'
import { useTranslation } from 'react-i18next'
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

  const selectedTags = tags.filter((tag) => selectedTagIds.has(tag.id))
  const isActive = selectedTags.length > 0
  const label = isActive
    ? selectedTags.length > 1
      ? `${tTag(selectedTags[0].name, t)} +${selectedTags.length - 1}`
      : tTag(selectedTags[0].name, t)
    : t(`tags.category.${category}`)

  const actions = useMemo<MenuAction[]>(
    () =>
      tags.map((tag) => ({
        id: tag.id,
        title: tTag(tag.name, t),
        state: (selectedTagIds.has(tag.id) ? 'on' : 'off') as 'on' | 'off',
      })),
    [tags, selectedTagIds, t],
  )

  const handlePressAction = useCallback(
    ({ nativeEvent }: NativeActionEvent) => onToggle(nativeEvent.event),
    [onToggle],
  )

  return (
    <MenuView title={t(`tags.category.${category}`)} actions={actions} onPressAction={handlePressAction}>
      <Pressable
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
    </MenuView>
  )
}

export default CategoryFilterChip

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    overflow: 'hidden',
    maxWidth: 140,
  },
  chipText: { fontSize: 13, color: colors.secondaryLabel },
  chipTextSelected: { color: '#ffffff', fontWeight: '600' },
})
