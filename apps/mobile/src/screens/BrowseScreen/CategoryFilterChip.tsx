import { useCallback, useMemo } from 'react'
import { Text } from 'react-native'
import { MenuView } from '@react-native-menu/menu'
import type { MenuAction, NativeActionEvent } from '@react-native-menu/menu'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'
import type { Tag, TagCategory } from '@carrot/shared/types'
import { tTag } from '@carrot/shared/utils/tagUtils'
import GlassChip from './GlassChip'
import { styles } from './styles'

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

  const handleOpenMenu = useCallback(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), [])

  const handlePressAction = useCallback(
    ({ nativeEvent }: NativeActionEvent) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid)
      onToggle(nativeEvent.event)
    },
    [onToggle],
  )

  return (
    <MenuView
      title={t(`tags.category.${category}`)}
      actions={actions}
      onOpenMenu={handleOpenMenu}
      onPressAction={handlePressAction}
    >
      <GlassChip
        selected={isActive}
        style={styles.categoryChip}
        accessibilityLabel={t(`tags.category.${category}`)}
        accessibilityRole="button"
        accessibilityState={{ selected: isActive }}
      >
        <Text style={[styles.chipText, isActive && styles.chipTextSelected]} numberOfLines={1}>
          {label} ▾
        </Text>
      </GlassChip>
    </MenuView>
  )
}

export default CategoryFilterChip
