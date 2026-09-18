import { useTranslation } from 'react-i18next'
import { Trash2 } from 'react-feather'
import type { ShoppingListItem } from '@carrot/shared/types'
import { CheckIcon } from '../Icons'

interface CompletedItemRowProps {
  item: ShoppingListItem
  onToggle: () => void
  onDelete: () => void
}

const CompletedItemRow = ({ item, onToggle, onDelete }: CompletedItemRowProps) => {
  const { t } = useTranslation()

  return (
    <div className="group flex items-center gap-3 px-4 md:px-6 py-2.5 border-b border-zinc-100">
      <button
        type="button"
        onClick={onToggle}
        aria-label={item.text}
        className="shrink-0 w-5 h-5 rounded-full bg-zinc-300 flex items-center justify-center text-white"
      >
        <CheckIcon />
      </button>
      <span className="flex-1 min-w-0 truncate text-sm text-zinc-400 line-through">
        {item.text}
      </span>
      <button
        type="button"
        onClick={onDelete}
        aria-label={t('common.delete')}
        className="shrink-0 w-7 h-7 flex items-center justify-center rounded text-zinc-300 hover:text-danger hover:bg-danger-50 transition-colors opacity-0 group-hover:opacity-100"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}

export default CompletedItemRow
