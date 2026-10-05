import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ShoppingCategory } from '@carrot/shared/types'
import { AISLE_STYLES } from '../aisles'
import CategoryMenu, { useDismiss } from '../CategoryMenu'

interface CategoryChipProps {
  category: ShoppingCategory
  categories: ShoppingCategory[]
  onPick: (category: ShoppingCategory) => void
  menuAbove: boolean
}

const CategoryChip = ({
  category,
  categories,
  onPick,
  menuAbove,
}: CategoryChipProps) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const style = AISLE_STYLES[category]
  const close = useCallback(() => setOpen(false), [])
  useDismiss(open, rootRef, close)

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('shoppingList.category')}
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-1 whitespace-nowrap rounded-full px-[9px] py-1 text-xs font-extrabold"
        style={{ background: style.bg, color: style.fg }}
      >
        → {t(`shoppingList.categories.${category}`)}
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          aria-hidden="true"
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <CategoryMenu
          category={category}
          categories={categories}
          placement={menuAbove ? 'above' : 'below'}
          onPick={(option) => {
            onPick(option)
            setOpen(false)
          }}
        />
      )}
    </div>
  )
}

export default CategoryChip
