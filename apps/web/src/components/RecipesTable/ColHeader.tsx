import SortIndicator from './SortIndicator'
import type { SortField, Sort } from './helpers'

interface ColHeaderProps {
  label: string
  field: SortField
  sort: Sort
  onToggleSort: (field: SortField) => void
  align?: 'left' | 'center'
  idleClassName?: string
}

const ColHeader = ({
  label,
  field,
  sort,
  onToggleSort,
  align = 'left',
  idleClassName = 'text-ink-subtle hover:text-ink-soft',
}: ColHeaderProps) => {
  const active = sort?.field === field
  const justifyClassName =
    align === 'center' ? 'justify-center' : 'justify-start'
  const colorClassName = active ? 'text-ink' : idleClassName

  return (
    <button
      type="button"
      onClick={() => onToggleSort(field)}
      className={`flex items-center text-xs font-extrabold uppercase tracking-[.06em] transition-colors whitespace-nowrap ${justifyClassName} ${colorClassName}`}
    >
      {label}
      <SortIndicator field={field} sort={sort} />
    </button>
  )
}

export default ColHeader
