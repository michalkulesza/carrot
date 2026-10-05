import { useTranslation } from 'react-i18next'
import type { ShoppingListItem } from '@carrot/shared/types'
import {
  displayIngredientWithLocalizedUnit,
  getIngredientQuantityCount,
} from '@carrot/shared/utils/ingredientUtils'
import {
  SHORT_UNITS,
  parseIngredient,
} from '../../components/RecipeDetailModal/helpers'
import { AISLE_STYLES } from './aisles'

export const useItemDisplay = (item: ShoppingListItem) => {
  const { t } = useTranslation()
  const translateUnit = (unit: string, qty: string) =>
    t(`units.${unit}`, {
      count:
        ['cl', 'piece', 'sprig', 'leaf', 'sheet'].includes(unit) && qty
          ? getIngredientQuantityCount(qty)
          : 1,
      defaultValue: unit,
    })
  const displayText = displayIngredientWithLocalizedUnit(
    item.text,
    translateUnit
  )
  const parsed = parseIngredient(item.text)
  const amount = parsed.qty
    ? [
        parsed.qty,
        !parsed.unit
          ? ''
          : SHORT_UNITS.has(parsed.unit)
            ? parsed.unit
            : translateUnit(parsed.unit, parsed.qty),
      ]
        .filter(Boolean)
        .join(' ')
    : ''

  return { displayText, amount, name: parsed.qty ? parsed.name : displayText }
}

// The floating copy of a row shown by the drag overlay while an item is
// being moved between aisles.
const ShoppingItemPreview = ({ item }: { item: ShoppingListItem }) => {
  const style = AISLE_STYLES[item.category]
  const { amount, name } = useItemDisplay(item)

  return (
    <div className="flex cursor-grabbing items-center gap-3 rounded-xl border border-[#ECEAF0] bg-white px-3 py-3 font-['Nunito',system-ui,sans-serif] shadow-[0_10px_28px_rgba(31,29,43,0.2)] md:py-2.5">
      <span
        className="h-6 w-6 shrink-0 rounded-full border-2 bg-white md:h-5 md:w-5"
        style={{ borderColor: style.dot }}
      />
      <span className="min-w-0 flex-1 truncate text-base text-[#1F1D2B] md:text-[15px]">
        {amount && <b className="font-extrabold">{amount} </b>}
        {name}
      </span>
    </div>
  )
}

export default ShoppingItemPreview
