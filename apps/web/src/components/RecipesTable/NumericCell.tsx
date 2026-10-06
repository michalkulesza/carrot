import EmptyDash from './EmptyDash'

interface NumericCellProps {
  value: number | null
  centered?: boolean
}

const NumericCell = ({ value, centered = false }: NumericCellProps) => (
  <div
    className={`overflow-hidden tabular-nums ${centered ? 'text-center' : ''}`}
  >
    {value != null ? value : <EmptyDash />}
  </div>
)

export default NumericCell
