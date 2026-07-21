import { useEffect, useRef, useState } from 'react'

export interface NutritionBoxGridItem {
  label: string
  value: string
  accessibilityLabel: string
  showDisclaimer?: boolean
  blurred?: boolean
}

interface NutritionBoxGridProps {
  items: NutritionBoxGridItem[]
  editing: boolean
  onChangeValue?: (index: number, value: string) => void
  disclaimerText: string
}

interface NutritionBoxEditableProps {
  item: NutritionBoxGridItem
  onChangeValue: (value: string) => void
}

const NutritionBoxEditable = ({
  item,
  onChangeValue,
}: NutritionBoxEditableProps) => (
  <div className="flex flex-col items-center justify-center rounded-[10px] bg-zinc-100 px-2 py-2 min-w-0">
    <input
      type="number"
      value={item.value}
      onChange={(e) => onChangeValue(e.target.value)}
      placeholder="—"
      aria-label={item.accessibilityLabel}
      className="w-full bg-transparent text-zinc-900 font-semibold text-base text-center focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    />
    <span className="mt-1 text-xs text-zinc-500 truncate max-w-full">
      {item.label}
    </span>
  </div>
)

interface NutritionBoxDisplayProps {
  item: NutritionBoxGridItem
  onToggle: () => void
}

const NutritionBoxDisplay = ({ item, onToggle }: NutritionBoxDisplayProps) => {
  const displayValue = item.value !== '' ? item.value : '—'

  if (item.showDisclaimer === false) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[10px] bg-zinc-100 px-2 py-2 min-w-0">
        <span className="text-base font-semibold text-zinc-900">
          {displayValue}
        </span>
        <span className="mt-1 text-xs text-zinc-500 truncate max-w-full">
          {item.label}
        </span>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={item.accessibilityLabel}
      className="w-full flex flex-col items-center justify-center rounded-[10px] bg-zinc-100 px-2 py-2 min-w-0 hover:bg-zinc-200 transition-colors"
    >
      <span className={`text-base font-semibold text-zinc-900 ${item.blurred ? 'blur-[4px] select-none' : ''}`}>
        {displayValue}
      </span>
      <span className="mt-1 text-xs text-zinc-500 truncate max-w-full">
        {item.label}
      </span>
    </button>
  )
}

const NutritionDisclaimer = ({ text }: { text: string }) => (
  <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 w-48 rounded-lg border border-zinc-200 bg-white p-2.5 text-xs text-zinc-600 shadow-lg z-20">
    {text}
  </div>
)

const NutritionBoxGrid = ({
  items,
  editing,
  onChangeValue,
  disclaimerText,
}: NutritionBoxGridProps) => {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const gridColumnsClass =
    items.length === 6
      ? 'grid-cols-3'
      : items.length === 4
        ? 'grid-cols-4'
        : 'grid-cols-5'

  useEffect(() => {
    if (openIndex === null) return
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpenIndex(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)

    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openIndex])

  useEffect(() => {
    if (editing) setOpenIndex(null)
  }, [editing])

  return (
    <div
      className={`flex-1 grid ${gridColumnsClass} gap-2 min-w-0`}
      ref={containerRef}
    >
      {items.map((item, i) => (
        <div key={item.label} className="relative min-w-0">
          {editing ? (
            <NutritionBoxEditable
              item={item}
              onChangeValue={(value) => onChangeValue?.(i, value)}
            />
          ) : (
            <NutritionBoxDisplay
              item={item}
              onToggle={() => setOpenIndex((v) => (v === i ? null : i))}
            />
          )}
          {openIndex === i && <NutritionDisclaimer text={disclaimerText} />}
        </div>
      ))}
    </div>
  )
}

export default NutritionBoxGrid
