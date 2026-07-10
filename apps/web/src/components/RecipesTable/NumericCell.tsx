import EmptyDash from './EmptyDash'

interface NumericCellProps {
  value: number | null
}

const NumericCell = ({ value }: NumericCellProps) => (
  <div className="text-sm text-zinc-600 text-right tabular-nums pr-2 overflow-hidden">
    {value != null ? value : <EmptyDash />}
  </div>
)

export default NumericCell
