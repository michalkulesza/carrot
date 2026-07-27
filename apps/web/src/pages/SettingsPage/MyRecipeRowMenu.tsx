import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

interface MyRecipeRowMenuProps {
  busy: boolean
  showDeleteFromHousehold: boolean
  householdName?: string
  onAddToHousehold: () => void
  onDeleteFromHousehold: () => void
  onDeleteEverywhere: () => void
}

// Renders into document.body via portal so overflow:hidden ancestors can't clip it
const MyRecipeRowMenu = ({
  busy,
  showDeleteFromHousehold,
  householdName,
  onAddToHousehold,
  onDeleteFromHousehold,
  onDeleteEverywhere,
}: MyRecipeRowMenuProps) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, right: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const openMenu = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    setOpen(true)
  }, [])

  const handleAddToHouseholdClick = useCallback(() => {
    setOpen(false)
    onAddToHousehold()
  }, [onAddToHousehold])

  const handleDeleteFromHouseholdClick = useCallback(() => {
    setOpen(false)
    onDeleteFromHousehold()
  }, [onDeleteFromHousehold])

  const handleDeleteEverywhereClick = useCallback(() => {
    setOpen(false)
    onDeleteEverywhere()
  }, [onDeleteEverywhere])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (
        menuRef.current?.contains(e.target as Node) ||
        triggerRef.current?.contains(e.target as Node)
      )
        return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)

    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const menuStyle = {
    position: 'fixed' as const,
    top: pos.top,
    right: pos.right,
    zIndex: 9999,
  }

  return (
    <div className="flex items-center justify-center">
      <button
        ref={triggerRef}
        type="button"
        disabled={busy}
        onClick={openMenu}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors text-base leading-none disabled:opacity-50 cursor-pointer disabled:cursor-default"
        aria-label={t('recipes.rowActions')}
      >
        ⋯
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={menuStyle}
            className="w-52 rounded-xl bg-white shadow-xl border border-zinc-100 py-1"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-full text-left px-4 py-2 text-sm hover:bg-zinc-50 transition-colors cursor-pointer"
              onClick={handleAddToHouseholdClick}
            >
              {t('recipes.addToHousehold')}
            </button>
            {showDeleteFromHousehold && (
              <button
                className="w-full text-left px-4 py-2 text-sm text-danger hover:bg-danger-50 transition-colors cursor-pointer"
                onClick={handleDeleteFromHouseholdClick}
              >
                {t('recipes.deleteFromHousehold', { name: householdName })}
              </button>
            )}
            <button
              className="w-full text-left px-4 py-2 text-sm text-danger hover:bg-danger-50 transition-colors cursor-pointer"
              onClick={handleDeleteEverywhereClick}
            >
              {t('recipes.deleteEverywhere')}
            </button>
          </div>,
          document.body
        )}
    </div>
  )
}

export default MyRecipeRowMenu
