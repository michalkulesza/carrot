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

  const stateClass = active
    ? 'bg-ink text-white border-ink'
    : 'bg-white text-ink-soft border-line hover:border-line-strong'

  return (
    <button
      type="button"
      onClick={() => onToggleTag(tag.id)}
      aria-pressed={active}
      className={`shrink-0 rounded-full border px-[11px] py-1 text-[13px] font-bold transition-colors ${stateClass}`}
    >
      {tTag(tag.name, t)}
    </button>
  )
}

export default FilterTagButton
