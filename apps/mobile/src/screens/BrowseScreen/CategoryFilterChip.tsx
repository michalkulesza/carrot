import { memo, useCallback, useMemo, type ReactElement } from 'react'
import { MenuView } from '@react-native-menu/menu'
import type { MenuAction, NativeActionEvent } from '@react-native-menu/menu'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'
import type { Tag, TagCategory } from '@carrot/shared/types'
import { tTag } from '@carrot/shared/utils/tagUtils'
import { FilterPill } from '../../components/ui'

interface CategoryFilterChipProps {
  category: TagCategory
  tags: Tag[]
  selectedTagIds: Set<string>
  onToggle: (tagId: string) => void
  onClearCategory: (tagIds: string[]) => void
}

const CategoryFilterChip = ({ category, tags, selectedTagIds, onToggle, onClearCategory }: CategoryFilterChipProps) => {
  const { t } = useTranslation()

  const categoryLabel = t(`tags.category.${category}`)
  const selectedTags = useMemo(() => tags.filter((tag) => selectedTagIds.has(tag.id)), [tags, selectedTagIds])
  const isActive = selectedTags.length > 0
  const extraCount = selectedTags.length - 1
  const activeLabel = isActive ? tTag(selectedTags[0].name, t) : categoryLabel
  const label = extraCount > 0 ? `${activeLabel} +${extraCount}` : activeLabel

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

  const handleClear = useCallback(
    () => onClearCategory(selectedTags.map((tag) => tag.id)),
    [onClearCategory, selectedTags],
  )

  const wrapLabel = useCallback(
    (content: ReactElement) => (
      <MenuView title={categoryLabel} actions={actions} onOpenMenu={handleOpenMenu} onPressAction={handlePressAction}>
        {content}
      </MenuView>
    ),
    [actions, categoryLabel, handleOpenMenu, handlePressAction],
  )

  return (
    <FilterPill
      label={label}
      active={isActive}
      trailing={isActive ? 'clear' : 'chevron'}
      onClear={handleClear}
      clearLabel={t('browse.clearCategory', { name: categoryLabel })}
      accessibilityLabel={categoryLabel}
      wrapLabel={wrapLabel}
    />
  )
}

export default memo(CategoryFilterChip)
