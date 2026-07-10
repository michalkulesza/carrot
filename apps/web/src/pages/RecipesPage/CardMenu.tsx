import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface CardMenuProps {
  onView: () => void
  onEdit: () => void
  onDelete: () => void
}

const CardMenu = ({ onView, onEdit, onDelete }: CardMenuProps) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)

    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const handleToggleOpen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setOpen((v) => !v)
  }, [])

  const handleView = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      setOpen(false)
      onView()
    },
    [onView]
  )

  const handleEdit = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      setOpen(false)
      onEdit()
    },
    [onEdit]
  )

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      setOpen(false)
      onDelete()
    },
    [onDelete]
  )

  return (
    <div ref={ref} className="relative self-center">
      <button
        type="button"
        onClick={handleToggleOpen}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors text-base leading-none"
        aria-label={t('recipes.recipeActions')}
      >
        ⋯
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-50 w-36 rounded-xl bg-white shadow-xl border border-zinc-100 py-1 overflow-hidden">
          <button
            className="w-full text-left px-4 py-2.5 text-sm hover:bg-zinc-50 transition-colors"
            onClick={handleView}
          >
            {t('common.view')}
          </button>
          <button
            className="w-full text-left px-4 py-2.5 text-sm hover:bg-zinc-50 transition-colors"
            onClick={handleEdit}
          >
            {t('common.edit')}
          </button>
          <button
            className="w-full text-left px-4 py-2.5 text-sm text-danger hover:bg-danger-50 transition-colors"
            onClick={handleDelete}
          >
            {t('common.delete')}
          </button>
        </div>
      )}
    </div>
  )
}

export default CardMenu
