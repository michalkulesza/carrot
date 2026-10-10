import { useTranslation } from 'react-i18next'
import { effectiveAllergenFlag } from '@carrot/shared/utils/allergenKeys'
import AllergenPopover from './AllergenPopover'
import { getMetricCupHint } from './helpers'
import LinkedAllergenBadges from './LinkedAllergenBadges'
import LinkedRecipeLink from './LinkedRecipeLink'
import { CheckIcon, HelpIcon, PlusIcon } from './PopupIcons'
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
  allergenUncertain?: boolean
  onOpenRecipe?: (id: string) => void
  recipeId?: string
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
  allergenUncertain = false,
  onOpenRecipe,
  recipeId,
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
          const flag = effectiveAllergenFlag(
            component.ingredient_flags?.[ingredientIndex]
          )
          const { amount, name } = formatParts(ingredient)
          const formatted = `${amount} ${name}`.trim()
          const link = component.ingredient_links?.[ingredientIndex]
          const linkedRecipeId = component.linked_recipe_ids?.[ingredientIndex]
          const linkKind = component.ingredient_link_kinds?.[ingredientIndex]
          const isExternalLink = linkKind === 'external'
          const linkLabel = isExternalLink
            ? t('recipes.openLink')
            : t('recipes.openLinkedRecipe')
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
                aria-label={showPlus ? t('shoppingList.addToList') : formatted}
                onClick={handleClick}
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
              </button>
              <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                <span
                  className={`${desktop ? 'text-[15px]' : 'text-base'} ${
                    done && !shoppingMode
                      ? 'text-[#B4B1BF] line-through'
                      : 'text-[#1F1D2B]'
                  }`}
                >
                  {amount && <b className="font-extrabold">{amount}</b>} {name}
                  {allergenUncertain &&
                    link &&
                    !isExternalLink &&
                    !flag?.linked_allergens && (
                    <span
                      role="img"
                      aria-label={t('recipes.allergensUncertain')}
                      title={t('recipes.allergensUncertain')}
                      className="ml-1.5 inline-block align-[-2px] text-[#C27A12]"
                    >
                      <HelpIcon size={15} />
                    </span>
                  )}
                  {getMetricCupHint(
                    component,
                    ingredientIndex,
                    unitSystem,
                    servingScale,
                    t
                  )}
                </span>
                {link && (
                  <LinkedRecipeLink
                    url={link}
                    kind={linkKind}
                    recipeId={linkedRecipeId}
                    parentRecipeId={recipeId}
                    onOpenRecipe={onOpenRecipe}
                    className="inline-flex items-center gap-1 rounded-full bg-[#EEEAFE] px-2.5 py-0.5 text-xs font-bold text-[#5B4BC4] hover:bg-[#E4DFF7]"
                  >
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M7 17 17 7M8 7h9v9" />
                    </svg>
                    {linkLabel}
                  </LinkedRecipeLink>
                )}
              </div>
              <LinkedAllergenBadges
                pill
                allergens={flag?.linked_allergens}
                activeAllergens={activeAllergens}
              />
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
