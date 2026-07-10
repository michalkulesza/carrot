import { useEffect, useRef, useState } from 'react'

interface IngredientPillProps {
  mention: string
  ingredientText: string
}

const IngredientPill = ({ mention, ingredientText }: IngredientPillProps) => {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      )
        setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)

    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleOpen = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      const showAbove = r.top > window.innerHeight / 2
      setPos({
        top: showAbove ? r.top - 4 : r.bottom + 4,
        left: r.left,
      })
    }
    setOpen((v) => !v)
  }

  const panelStyle: React.CSSProperties = {
    position: 'fixed',
    top: pos.top,
    left: pos.left,
    zIndex: 9999,
    transform: pos.top < window.innerHeight / 2 ? 'none' : 'translateY(-100%)',
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        aria-label={ingredientText}
        className="inline-flex items-center bg-blue-50 text-blue-700 rounded-md px-2 py-0.5 text-xs font-medium cursor-pointer hover:bg-blue-100 transition-colors"
      >
        {mention}
      </button>
      {open && (
        <div
          ref={panelRef}
          style={panelStyle}
          className="bg-white border border-zinc-200 rounded-xl shadow-lg p-3 text-sm max-w-[260px]"
        >
          {ingredientText}
        </div>
      )}
    </>
  )
}

export default IngredientPill
