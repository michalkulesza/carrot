import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import IngredientChecklist, {
  type IngredientChecklistProps,
} from './IngredientChecklist'
import { ChevronDownIcon } from './PopupIcons'

const PEEK_THRESHOLD = 6

interface RecipeIngredientsCardProps extends IngredientChecklistProps {
  servings: number | null
  allAdded: boolean
  onAddAll: () => void
  onToggleShoppingMode: () => void
}

const RecipeIngredientsCard = ({
  servings,
  allAdded,
  onAddAll,
  onToggleShoppingMode,
  ...checklist
}: RecipeIngredientsCardProps) => {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const count = checklist.items.length
  const collapsible = count > PEEK_THRESHOLD
  const collapsed = collapsible && !expanded

  return (
    <section className="flex flex-col gap-1.5 rounded-[14px] border border-[#ECEAF0] px-[18px] pb-2.5 pt-4">
      <div className="flex items-baseline gap-2">
        <h3 className="text-lg font-extrabold">
          {t('recipes.sectionIngredients')}
        </h3>
        <span className="text-sm font-semibold text-[#8C8A99]">
          {count}
          {servings !== null &&
            ` · ${t('recipes.forServings', { count: servings })}`}
        </span>
        <span className="flex-1" />
        {checklist.shoppingMode && !allAdded && (
          <button
            type="button"
            onClick={onAddAll}
            className="mr-1 text-[13px] font-bold text-[#E07B39] hover:underline"
          >
            {t('shoppingList.addAll')}
          </button>
        )}
        <button
          type="button"
          onClick={onToggleShoppingMode}
          aria-pressed={checklist.shoppingMode}
          className={`rounded-full text-[13px] font-bold ${
            checklist.shoppingMode
              ? 'bg-[#E8894A] px-2.5 py-0.5 text-white'
              : 'text-[#E07B39] hover:underline'
          }`}
        >
          {t('shoppingList.addToList')}
        </button>
      </div>
      <div
        className={`relative overflow-hidden transition-[max-height] duration-300 ${
          collapsed ? 'max-h-[122px]' : 'max-h-[600px]'
        }`}
      >
        <IngredientChecklist {...checklist} desktop />
        {collapsed && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-b from-white/0 to-white" />
        )}
      </div>
      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          className="flex items-center gap-1.5 self-center rounded-full px-3.5 py-2 text-sm font-bold text-[#E07B39] hover:bg-[#FDEFE4]"
        >
          {expanded
            ? t('common.showLess')
            : t('recipes.showAllIngredients', { count })}
          <ChevronDownIcon
            className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          />
        </button>
      )}
    </section>
  )
}

export default RecipeIngredientsCard
