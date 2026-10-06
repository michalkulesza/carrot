import type { Tag } from '@carrot/shared/types'
import FilterTagButton from '../FilterTagButton'

interface TagPillsProps {
  tags: Tag[]
  selectedTagIds: Set<string>
  onToggleTag: (tagId: string) => void
}

const TagPills = ({ tags, selectedTagIds, onToggleTag }: TagPillsProps) => {
  return (
    <>
      {tags.map((tag) => (
        <FilterTagButton
          key={tag.id}
          tag={tag}
          active={selectedTagIds.has(tag.id)}
          onToggleTag={onToggleTag}
        />
      ))}
    </>
  )
}

export default TagPills
