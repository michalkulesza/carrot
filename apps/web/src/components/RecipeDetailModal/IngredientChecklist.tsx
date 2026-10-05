import { useTranslation } from 'react-i18next'
import AllergenPopover from './AllergenPopover'
import { getMetricCupHint } from './helpers'
import { CheckIcon, PlusIcon } from './PopupIcons'
import type {
  IngredientParts,
  UnifiedIngredient,
} from './useUnifiedIngredients'

export interface IngredientChecklistProps {
  items: UnifiedIngredient[]
  formatParts: (ingredient: string) => IngredientParts
  checkedIngredients: Set<string>
  onToggleIngredient: (key: string) => void
  onReplaceIngredient: (componentIndex: number, ingredientIndex: number) => void
  onRestoreIngredient: (componentIndex: number, ingredientIndex: number) => void
  activeAllergens: string[]
  unitSystem: string
  servingScale: number
  shoppingMode: boolean
  sessionAdded: Set<string>
  onAddIngredient: (componentIndex: number, ingredientIndex: number) => void
}

interface IngredientChecklistViewProps extends IngredientChecklistProps {
  desktop: boolean
}

const IngredientChecklist = ({
  items,
  formatParts,
  checkedIngredients,
  onToggleIngredient,
  onReplaceIngredient,
  onRestoreIngredient,
  activeAllergens,
  unitSystem,
  servingScale,
  shoppingMode,
  sessionAdded,
  onAddIngredient,
  desktop,
}: IngredientChecklistViewProps) => {
  const { t } = useTranslation()
  const box = desktop
    ? 'h-[18px] w-[18px] rounded-[5px]'
    : 'h-[22px] w-[22px] rounded-[7px]'

  return (
    <ul
      className={desktop ? 'grid grid-cols-2 gap-x-7 gap-y-1' : 'flex flex-col'}
    >
      {items.map(
        ({ key, component, componentIndex, ingredient, ingredientIndex }) => {
          const added = sessionAdded.has(key)
          const done = shoppingMode ? added : checkedIngredients.has(key)
          const showPlus = shoppingMode && !added
          const flag = component.ingredient_flags?.[ingredientIndex]
          const { amount, name } = formatParts(ingredient)
          const handleClick = () => {
            if (showPlus) onAddIngredient(componentIndex, ingredientIndex)
            else if (!shoppingMode) onToggleIngredient(key)
          }

          return (
            <li
              key={key}
              className={`flex items-center border-b border-[#F4F3F7] ${
                desktop ? 'gap-3 py-2' : 'min-h-[52px] gap-3.5'
              }`}
            >
              <button
                type="button"
                role="checkbox"
                aria-checked={done}
                aria-label={showPlus ? t('shoppingList.addToList') : undefined}
                onClick={handleClick}
                className={`flex min-w-0 flex-1 items-center text-left ${desktop ? 'gap-3' : 'gap-3.5'}`}
              >
                <span
                  className={`flex shrink-0 items-center justify-center border-[1.5px] ${box} ${
                    showPlus
                      ? 'border-[#E8894A] bg-[#FDEFE4] text-[#E07B39]'
                      : done
                        ? shoppingMode
                          ? 'border-emerald-500 bg-emerald-500'
                          : 'border-[#E8894A] bg-[#E8894A]'
                        : 'border-[#CFCBD8] bg-white'
                  }`}
                >
                  {showPlus ? (
                    <PlusIcon size={desktop ? 11 : 13} />
                  ) : (
                    done && <CheckIcon size={desktop ? 11 : 12} />
                  )}
                </span>
                <span
                  className={`flex-1 ${desktop ? 'text-[15px]' : 'text-base'} ${
                    done && !shoppingMode
                      ? 'text-[#B4B1BF] line-through'
                      : 'text-[#1F1D2B]'
                  }`}
                >
                  {amount && <b className="font-extrabold">{amount}</b>} {name}
                  {getMetricCupHint(
                    component,
                    ingredientIndex,
                    unitSystem,
                    servingScale,
                    t
                  )}
                </span>
              </button>
              {flag && (
                <AllergenPopover
                  pill
                  flag={flag}
                  activeAllergens={activeAllergens}
                  onReplace={() =>
                    onReplaceIngredient(componentIndex, ingredientIndex)
                  }
                  onRestore={() =>
                    onRestoreIngredient(componentIndex, ingredientIndex)
                  }
                />
              )}
            </li>
          )
        }
      )}
    </ul>
  )
}

export default IngredientChecklist
