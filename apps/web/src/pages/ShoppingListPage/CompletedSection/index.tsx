import { useTranslation } from 'react-i18next'
import type { ShoppingListItem } from '@carrot/shared/types'
import CompletedItemRow from '../CompletedItemRow'

interface CompletedSectionProps {
  items: ShoppingListItem[]
  onToggle: (item: ShoppingListItem) => void
  onDelete: (item: ShoppingListItem) => void
  onClear: () => void
}

const CompletedSection = ({ items, onToggle, onDelete, onClear }: CompletedSectionProps) => {
  const { t } = useTranslation()

  if (items.length === 0) return null

  return (
    <div>
      <div className="flex items-center justify-between px-4 md:px-6 py-2 bg-zinc-50 border-b border-zinc-100">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          {items.length} {t('shoppingList.completedSection')}
        </span>
        <button
          type="button"
          onClick={onClear}
          className="text-xs font-medium text-primary hover:underline"
        >
          {t('shoppingList.clearCompleted')}
        </button>
      </div>
      {items.map((item) => (
        <CompletedItemRow
          key={item.id}
          item={item}
          onToggle={() => onToggle(item)}
          onDelete={() => onDelete(item)}
        />
      ))}
    </div>
  )
}

export default CompletedSection
