import { useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { ShoppingCategory } from '@carrot/shared/types'
import { useMediaQuery } from '../../../hooks/useMediaQuery'
import { guessCategory, parseItemText } from '../aisles'
import CategoryChip from './CategoryChip'

interface AddItemRowProps {
  categories: ShoppingCategory[]
  onAdd: (text: string, category: ShoppingCategory) => void
}

const AddItemRow = ({ categories, onAdd }: AddItemRowProps) => {
  const { t, i18n } = useTranslation()
  const [text, setText] = useState('')
  const wide = useMediaQuery('(min-width: 768px)')
  const submittedRef = useRef(false)
  const [picked, setPicked] = useState<ShoppingCategory | null>(null)
  const trimmed = text.trim()
  const parsed = trimmed ? parseItemText(trimmed) : null
  const category = trimmed
    ? (picked ?? guessCategory(trimmed, i18n.resolvedLanguage ?? i18n.language))
    : null

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!trimmed || !category || submittedRef.current) return

    submittedRef.current = true
    onAdd(trimmed, category)
    setText('')
    setPicked(null)
  }

  const renderChips = (menuAbove: boolean) =>
    parsed && category ? (
      <>
        {parsed.amount && (
          <span className="whitespace-nowrap rounded-full bg-[#F4F3F7] px-[9px] py-1 text-xs font-extrabold">
            {parsed.amount}
          </span>
        )}
        <CategoryChip
          category={category}
          categories={categories}
          onPick={setPicked}
          menuAbove={menuAbove}
        />
      </>
    ) : null

  return (
    <form
      onSubmit={handleSubmit}
      className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 flex flex-col gap-2 border-t border-[#ECEAF0] bg-white px-3.5 pb-3 pt-3 font-['Nunito',system-ui,sans-serif] md:static md:z-auto md:flex-row md:items-center md:gap-2.5 md:rounded-[14px] md:border md:border-t md:border-[1.5px] md:py-0 md:pl-4 md:pr-1.5 md:h-[52px]"
    >
      <div className="flex min-h-0 gap-1.5 md:hidden">{renderChips(true)}</div>
      <div className="flex items-center gap-2 md:contents">
        <div className="flex h-[52px] flex-1 items-center rounded-full bg-[#F4F3F7] px-[18px] md:h-auto md:bg-transparent md:p-0">
          <input
            type="text"
            value={text}
            onChange={(event) => {
              submittedRef.current = false
              setText(event.target.value)
              if (!event.target.value.trim()) setPicked(null)
            }}
            placeholder={
              wide
                ? t('shoppingList.addItemHint')
                : t('shoppingList.addItemShort')
            }
            aria-label={t('shoppingList.addItemShort')}
            className="min-w-0 flex-1 bg-transparent text-base text-[#1F1D2B] outline-none placeholder:text-[#A9A6B4]"
          />
        </div>
        <div className="hidden items-center gap-2.5 md:flex">
          {renderChips(false)}
        </div>
        <button
          type="submit"
          disabled={!trimmed}
          aria-label={t('common.add')}
          className={`flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full font-extrabold transition-all duration-150 md:h-10 md:w-auto md:gap-1.5 md:rounded-[10px] md:pl-3 md:pr-4 md:text-sm ${
            trimmed ? 'bg-[#E8894A] text-white' : 'bg-[#F4F3F7] text-[#A9A6B4]'
          }`}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            aria-hidden="true"
            className="md:h-3.5 md:w-3.5"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span className="hidden md:inline">{t('common.add')}</span>
        </button>
      </div>
    </form>
  )
}

export default AddItemRow
