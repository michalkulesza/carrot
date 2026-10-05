import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import IngredientChecklist, {
  type IngredientChecklistProps,
} from './IngredientChecklist'
import PopupStepper from './PopupStepper'
import PopupSurface from '../PopupSurface'

interface RecipeIngredientsSheetProps extends IngredientChecklistProps {
  servings: number | null
  onDecreaseServings: () => void
  onIncreaseServings: () => void
  allAdded: boolean
  onAddAll: () => void
  onToggleShoppingMode: () => void
  onClose: () => void
  notice?: ReactNode
}

const RecipeIngredientsSheet = ({
  servings,
  onDecreaseServings,
  onIncreaseServings,
  allAdded,
  onAddAll,
  onToggleShoppingMode,
  onClose,
  notice,
  ...checklist
}: RecipeIngredientsSheetProps) => {
  const { t } = useTranslation()

  return (
    <PopupSurface
      className="absolute inset-0 z-30"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <button
        type="button"
        aria-label={t('common.close')}
        onClick={onClose}
        className="absolute inset-0 bg-[rgba(20,16,24,0.45)]"
      />
      <PopupSurface
        role="dialog"
        aria-label={t('recipes.sectionIngredients')}
        className="absolute inset-x-0 bottom-0 flex max-h-[78%] flex-col rounded-t-3xl bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.18)]"
      >
        <div className="flex justify-center pb-1 pt-2.5">
          <div className="h-[5px] w-10 rounded-full bg-[#DDD9E4]" />
        </div>
        <div className="flex items-center gap-2.5 border-b border-[#F1EFF5] px-5 pb-3 pt-2">
          <div className="flex flex-1 flex-col">
            <span className="text-xl font-extrabold">
              {t('recipes.sectionIngredients')}
            </span>
            {servings !== null && (
              <span className="text-[13px] font-semibold text-[#8C8A99]">
                {t('recipes.ingredientsForServings', { count: servings })}
              </span>
            )}
          </div>
          {servings !== null && (
            <PopupStepper
              servings={servings}
              onDecrease={onDecreaseServings}
              onIncrease={onIncreaseServings}
              desktop={false}
            />
          )}
        </div>
        <div className="flex-1 overflow-auto px-5 py-1 [scrollbar-width:none]">
          <IngredientChecklist {...checklist} desktop={false} />
          {notice && <div className="py-3">{notice}</div>}
        </div>
        <div className="flex gap-2.5 px-4 pb-[30px] pt-3">
          {checklist.shoppingMode && !allAdded && (
            <button
              type="button"
              onClick={onAddAll}
              className="flex h-[52px] flex-1 items-center justify-center rounded-[14px] border border-[#E4E1EA] text-base font-extrabold text-[#E07B39]"
            >
              {t('shoppingList.addAll')}
            </button>
          )}
          <button
            type="button"
            onClick={onToggleShoppingMode}
            aria-pressed={checklist.shoppingMode}
            className={`flex h-[52px] flex-1 items-center justify-center rounded-[14px] border text-base font-extrabold ${
              checklist.shoppingMode
                ? 'border-[#E8894A] bg-[#E8894A] text-white'
                : 'border-[#E4E1EA] text-[#E07B39]'
            }`}
          >
            {t('shoppingList.addToList')}
          </button>
        </div>
      </PopupSurface>
    </PopupSurface>
  )
}

export default RecipeIngredientsSheet
