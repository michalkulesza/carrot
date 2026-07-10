import SortIndicator from './SortIndicator'
import type { SortField, Sort } from './helpers'

interface ColHeaderProps {
  label: string
  field: SortField
  sort: Sort
  onToggleSort: (field: SortField) => void
  align?: 'left' | 'right'
}

const ColHeader = ({
  label,
  field,
  sort,
  onToggleSort,
  align = 'left',
}: ColHeaderProps) => {
  const active = sort?.field === field
  const justifyClassName = align === 'right' ? 'justify-end' : 'justify-start'
  const colorClassName = active
    ? 'text-zinc-700'
    : 'text-zinc-400 hover:text-zinc-600'

  return (
    <button
      type="button"
      onClick={() => onToggleSort(field)}
      className={`flex items-center gap-0.5 text-xs font-semibold uppercase tracking-wide transition-colors whitespace-nowrap ${justifyClassName} ${colorClassName}`}
    >
      {label}
      <SortIndicator field={field} sort={sort} />
    </button>
  )
}

export default ColHeader
