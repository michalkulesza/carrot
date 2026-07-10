import type { SortField, Sort } from './helpers'

interface SortIndicatorProps {
  field: SortField
  sort: Sort
}

const SortIndicator = ({ field, sort }: SortIndicatorProps) => {
  if (!sort || sort.field !== field) {
    return null
  }

  return (
    <span className="ml-1 text-primary text-[10px]">
      {sort.dir === 'asc' ? '↑' : '↓'}
    </span>
  )
}

export default SortIndicator
