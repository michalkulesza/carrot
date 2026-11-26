import { memo } from 'react'
import { type LayoutChangeEvent, ScrollView, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { Tag } from '@carrot/shared/types'
import { TAG_CATEGORIES, type groupTagsByCategory } from '@carrot/shared/utils/tagFilters'
import { FilterPill } from '../../components/ui'
import { palette, screenGutter, space } from '../../theme'
import CategoryFilterChip from './CategoryFilterChip'
import OtherTagPill from './OtherTagPill'

interface FilterBarProps {
  groupedTags: ReturnType<typeof groupTagsByCategory>
  selectedTagIds: Set<string>
  filterFavourites: boolean
  onToggleTag: (tagId: string) => void
  onClearCategory: (tagIds: string[]) => void
  onToggleFavourites: () => void
  top: number
  onLayout: (event: LayoutChangeEvent) => void
}

const FilterBar = ({
  groupedTags,
  selectedTagIds,
  filterFavourites,
  onToggleTag,
  onClearCategory,
  onToggleFavourites,
  top,
  onLayout,
}: FilterBarProps) => {
  const { t } = useTranslation()
  const otherTags: Tag[] = groupedTags.other

  return (
    <View style={[styles.bar, { top }]} onLayout={onLayout}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content}>
        <FilterPill
          icon="star.fill"
          active={filterFavourites}
          onPress={onToggleFavourites}
          accessibilityLabel={t('recipes.filterFavourites')}
        />
        {TAG_CATEGORIES.map((category) => (
          <CategoryFilterChip
            key={category}
            category={category}
            tags={groupedTags[category]}
            selectedTagIds={selectedTagIds}
            onToggle={onToggleTag}
            onClearCategory={onClearCategory}
          />
        ))}
        {otherTags.length > 0 ? <View style={styles.divider} /> : null}
        {otherTags.map((tag) => (
          <OtherTagPill key={tag.id} tag={tag} isSelected={selectedTagIds.has(tag.id)} onToggle={onToggleTag} />
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0 },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: screenGutter,
    paddingTop: space.xs,
    paddingBottom: space.md,
  },
  divider: { width: StyleSheet.hairlineWidth, height: 20, backgroundColor: palette.dividerStrong, marginHorizontal: space.xs },
})

export default memo(FilterBar)
