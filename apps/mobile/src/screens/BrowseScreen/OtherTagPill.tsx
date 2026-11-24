import { memo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { Tag } from '@carrot/shared/types'
import { tTag } from '@carrot/shared/utils/tagUtils'
import { FilterPill } from '../../components/ui'

interface OtherTagPillProps {
  tag: Tag
  isSelected: boolean
  onToggle: (tagId: string) => void
}

const OtherTagPill = ({ tag, isSelected, onToggle }: OtherTagPillProps) => {
  const { t } = useTranslation()
  const handlePress = useCallback(() => onToggle(tag.id), [onToggle, tag.id])

  return (
    <FilterPill
      label={tTag(tag.name, t)}
      active={isSelected}
      onPress={handlePress}
      accessibilityLabel={tag.name}
    />
  )
}

export default memo(OtherTagPill)
