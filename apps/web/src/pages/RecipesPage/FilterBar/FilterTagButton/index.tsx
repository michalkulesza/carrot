import { useTranslation } from 'react-i18next'
import type { Tag } from '@carrot/shared/types'
import { tTag } from '@carrot/shared/utils/tagUtils'

interface FilterTagButtonProps {
  tag: Tag
  active: boolean
  onToggleTag: (tagId: string) => void
}

const FilterTagButton = ({
  tag,
  active,
  onToggleTag,
}: FilterTagButtonProps) => {
  const { t } = useTranslation()

  const buttonClass = active
    ? 'shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors bg-secondary text-white'
    : 'shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors bg-zinc-100 text-zinc-600 hover:bg-zinc-200'

  return (
    <button
      type="button"
      onClick={() => onToggleTag(tag.id)}
      className={buttonClass}
    >
      {tTag(tag.name, t)}
    </button>
  )
}

export default FilterTagButton
