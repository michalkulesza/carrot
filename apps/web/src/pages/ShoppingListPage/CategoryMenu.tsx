import { useEffect, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import type { ShoppingCategory } from '@carrot/shared/types'
import { AISLE_STYLES } from './aisles'

export const useDismiss = (
  open: boolean,
  rootRef: RefObject<HTMLElement | null>,
  onClose: () => void
) => {
  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onClose()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, rootRef, onClose])
}

interface CategoryMenuProps {
  category: ShoppingCategory
  categories: ShoppingCategory[]
  onPick: (category: ShoppingCategory) => void
  placement: 'above' | 'below'
}

const CategoryMenu = ({
  category,
  categories,
  onPick,
  placement,
}: CategoryMenuProps) => {
  const { t } = useTranslation()

  return (
    <div
      role="menu"
      className={`absolute right-0 z-40 flex min-w-[170px] flex-col gap-0.5 rounded-xl border border-[#ECEAF0] bg-white p-1.5 font-['Nunito',system-ui,sans-serif] shadow-[0_8px_24px_rgba(31,29,43,0.14)] ${
        placement === 'above'
          ? 'bottom-[calc(100%+6px)]'
          : 'top-[calc(100%+6px)]'
      }`}
    >
      {categories.map((option) => {
        const optionStyle = AISLE_STYLES[option]

        return (
          <button
            key={option}
            type="button"
            role="menuitemradio"
            aria-checked={option === category}
            onClick={() => onPick(option)}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-bold hover:bg-[#FBFAFC]"
            style={{ color: optionStyle.fg }}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: optionStyle.dot }}
            />
            <span className="flex-1">
              {t(`shoppingList.categories.${option}`)}
            </span>
            {option === category && (
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m5 12 5 5 9-10" />
              </svg>
            )}
          </button>
        )
      })}
    </div>
  )
}

export default CategoryMenu
