import EmptyDash from './EmptyDash'

export type Macro = 'protein' | 'fat' | 'carbs'

interface MacroCellProps {
  value: number | null
  max: number
  macro: Macro
}

const MACRO_CLASSES: Record<Macro, { track: string; fill: string }> = {
  protein: { track: 'bg-protein-track', fill: 'bg-protein' },
  fat: { track: 'bg-fat-track', fill: 'bg-fat' },
  carbs: { track: 'bg-carbs-track', fill: 'bg-carbs' },
}

const MacroCell = ({ value, max, macro }: MacroCellProps) => {
  if (value == null) {
    return <EmptyDash />
  }

  const classes = MACRO_CLASSES[macro]
  const percent = max > 0 ? Math.round((value / max) * 100) : 0

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-extrabold">{value}g</span>
      <div className={`h-1.5 overflow-hidden rounded-full ${classes.track}`}>
        <div
          className={`h-full rounded-full ${classes.fill}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

export default MacroCell
