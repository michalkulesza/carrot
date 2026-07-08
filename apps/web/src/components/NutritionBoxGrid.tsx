import { useEffect, useRef, useState } from 'react'

export interface NutritionBoxGridItem {
  label: string
  value: string
  accessibilityLabel: string
}

interface NutritionBoxGridProps {
  items: NutritionBoxGridItem[]
  editing: boolean
  onChangeValue?: (index: number, value: string) => void
  disclaimerText: string
}

const NutritionBoxGrid = ({
  items,
  editing,
  onChangeValue,
  disclaimerText,
}: NutritionBoxGridProps) => {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (openIndex === null) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
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
    <div className="flex-1 grid grid-cols-5 gap-2 min-w-0" ref={containerRef}>
      {items.map((item, i) => (
        <div key={item.label} className="relative min-w-0">
          {editing ? (
            <div className="flex flex-col items-center justify-center border border-zinc-200 rounded-lg px-2 py-3 min-w-0">
              <input
                type="number"
                value={item.value}
                onChange={(e) => onChangeValue?.(i, e.target.value)}
                placeholder="—"
                aria-label={item.accessibilityLabel}
                className="w-full bg-transparent text-zinc-900 font-semibold text-sm text-center focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span className="text-[11px] text-zinc-500 truncate max-w-full">
                {item.label}
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setOpenIndex((v) => (v === i ? null : i))}
              aria-label={item.accessibilityLabel}
              className="w-full flex flex-col items-center justify-center border border-zinc-200 rounded-lg px-2 py-3 min-w-0 hover:bg-zinc-50 transition-colors"
            >
              <span className="text-sm font-semibold text-zinc-900">
                {item.value !== '' ? item.value : '—'}
              </span>
              <span className="text-[11px] text-zinc-500 truncate max-w-full">
                {item.label}
              </span>
            </button>
          )}
          {openIndex === i && (
            <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 w-48 rounded-lg border border-zinc-200 bg-white p-2.5 text-xs text-zinc-600 shadow-lg z-20">
              {disclaimerText}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default NutritionBoxGrid
