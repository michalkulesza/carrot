import { memo, useCallback } from 'react'
import { type LayoutChangeEvent, ScrollView, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'
import type { Tag } from '@carrot/shared/types'
import { TAG_CATEGORIES, type groupTagsByCategory } from '@carrot/shared/utils/tagFilters'
import CategoryFilterChip from './CategoryFilterChip'
import GlassChip from './GlassChip'
import TagChip from './TagChip'
import { styles } from './styles'

interface FilterBarProps {
  groupedTags: ReturnType<typeof groupTagsByCategory>
  selectedTagIds: Set<string>
  filterFavourites: boolean
  onToggleTag: (tagId: string) => void
  onToggleFavourites: () => void
  top: number
  onLayout: (event: LayoutChangeEvent) => void
}

const FilterBar = ({
  groupedTags,
  selectedTagIds,
  filterFavourites,
  onToggleTag,
  onToggleFavourites,
  top,
  onLayout,
}: FilterBarProps) => {
  const { t } = useTranslation()
  const otherTags: Tag[] = groupedTags.other

  const handleFavouritesPress = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onToggleFavourites()
  }, [onToggleFavourites])

  return (
    <View style={[styles.tagBar, { top }]} onLayout={onLayout}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagListContent}>
        <GlassChip
          selected={filterFavourites}
          onPress={handleFavouritesPress}
          style={styles.favChip}
          accessibilityLabel={t('recipes.filterFavourites')}
          accessibilityRole="button"
          accessibilityState={{ selected: filterFavourites }}
        >
          <Text style={[styles.favChipText, filterFavourites && styles.chipTextSelected]}>★</Text>
        </GlassChip>
        {TAG_CATEGORIES.map((category) => (
          <CategoryFilterChip
            key={category}
            category={category}
            tags={groupedTags[category]}
            selectedTagIds={selectedTagIds}
            onToggle={onToggleTag}
          />
        ))}
        {otherTags.length > 0 && <View style={styles.tagBarDivider} />}
        {otherTags.map((tag) => (
          <TagChip key={tag.id} tag={tag} isSelected={selectedTagIds.has(tag.id)} onToggle={onToggleTag} />
        ))}
      </ScrollView>
    </View>
  )
}

export default memo(FilterBar)
