import { memo, useCallback } from 'react'
import { Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'
import type { Tag } from '@carrot/shared/types'
import { tTag } from '@carrot/shared/utils/tagUtils'
import GlassChip from './GlassChip'
import { styles } from './styles'

interface TagChipProps {
  tag: Tag
  isSelected: boolean
  onToggle: (tagId: string) => void
}

const TagChip = ({ tag, isSelected, onToggle }: TagChipProps) => {
  const { t } = useTranslation()

  const handlePress = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onToggle(tag.id)
  }, [onToggle, tag.id])

  return (
    <GlassChip
      selected={isSelected}
      onPress={handlePress}
      style={styles.chip}
      accessibilityLabel={tag.name}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
    >
      <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{tTag(tag.name, t)}</Text>
    </GlassChip>
  )
}

export default memo(TagChip)
