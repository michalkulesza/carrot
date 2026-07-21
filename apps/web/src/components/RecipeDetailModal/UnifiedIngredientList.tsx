import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { SaveComponent } from '@carrot/shared/types'
import {
  displayIngredient,
  getMetricCupHint,
  getScaledIngredientValues,
} from './helpers'
import AllergenPopover from './AllergenPopover'

const TEXT_SIZE_CLASSES = [
  'text-sm',
  'text-base',
  'text-[17px]',
  'text-xl',
  'text-2xl',
] as const

interface UnifiedIngredient {
  component: SaveComponent
  componentIndex: number
  ingredient: string
  ingredientIndex: number
}

const UnifiedIngredientList = ({
  components,
  unitSystem,
  servingScale,
  activeAllergens,
  addMode,
  sessionAdded,
  checkedIngredients,
  onToggleIngredient,
  onReplaceIngredient,
  onRestoreIngredient,
  onAddIngredient,
  onAddAllIngredients,
  fontSizeIndex,
  readOnly = false,
}: {
  components: SaveComponent[]
  unitSystem: string
  servingScale: number
  activeAllergens: string[]
  addMode: boolean
  sessionAdded: Set<string>
  checkedIngredients: Set<string>
  onToggleIngredient: (key: string) => void
  onReplaceIngredient: (componentIndex: number, ingredientIndex: number) => void
  onRestoreIngredient: (componentIndex: number, ingredientIndex: number) => void
  onAddIngredient: (componentIndex: number, ingredientIndex: number) => void
  onAddAllIngredients: () => void
  fontSizeIndex: number
  readOnly?: boolean
}) => {
  const { t } = useTranslation()
  const ingredients = useMemo<UnifiedIngredient[]>(
    () =>
      components.flatMap((component, componentIndex) =>
        getScaledIngredientValues(component, unitSystem, servingScale).map(
          (ingredient, ingredientIndex) => ({
            component,
            componentIndex,
            ingredient,
            ingredientIndex,
          })
        )
      ),
    [components, servingScale, unitSystem]
  )
  const allIngredientsAdded =
    ingredients.length > 0 &&
    ingredients.every(({ componentIndex, ingredientIndex }) =>
      sessionAdded.has(`${componentIndex}-${ingredientIndex}`)
    )

  if (ingredients.length === 0) return null

  return (
    <section className="mt-8 mb-5">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold uppercase text-zinc-400">
          {t('recipes.sectionIngredients')}
        </p>
        {addMode && (
          <button
            type="button"
            onClick={onAddAllIngredients}
            disabled={allIngredientsAdded}
            className="text-sm font-medium text-primary hover:underline cursor-pointer disabled:text-zinc-300 disabled:no-underline disabled:cursor-default px-1 py-0.5"
          >
            {allIngredientsAdded
              ? t('shoppingList.addedToList')
              : t('shoppingList.addAll')}
          </button>
        )}
      </div>
      <ul className="space-y-1">
        {ingredients.map(
          ({ component, componentIndex, ingredient, ingredientIndex }) => {
            const key = `${componentIndex}-${ingredientIndex}`
            const flag = component.ingredient_flags?.[ingredientIndex]
            const added = sessionAdded.has(key)
            const checked = checkedIngredients.has(key)
            const addButtonLabel = added
              ? t('shoppingList.addedToList')
              : t('shoppingList.addToList')

            return (
              <li
                key={key}
                className={`flex items-start gap-2 ${TEXT_SIZE_CLASSES[fontSizeIndex]}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleIngredient(key)}
                  aria-label={displayIngredient(ingredient)}
                  className="mt-1 h-4 w-4 shrink-0 accent-primary"
                />
                <span
                  className={`flex-1 transition-colors ${
                    checked ? 'text-zinc-400 line-through' : ''
                  }`}
                >
                  {displayIngredient(ingredient)}
                  {getMetricCupHint(
                    component,
                    ingredientIndex,
                    unitSystem,
                    servingScale,
                    t
                  )}
                </span>
                {!readOnly && flag && (
                  <AllergenPopover
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
                {addMode && (
                  <button
                    type="button"
                    onClick={
                      added
                        ? undefined
                        : () => onAddIngredient(componentIndex, ingredientIndex)
                    }
                    aria-label={addButtonLabel}
                    className={`shrink-0 -mt-0.5 -mr-1 flex items-center justify-center w-7 h-7 rounded-full transition-colors ${
                      added
                        ? 'text-emerald-500 cursor-default'
                        : 'text-primary hover:bg-primary/10 hover:text-primary-600 cursor-pointer'
                    }`}
                  >
                    {added ? '✓' : '+'}
                  </button>
                )}
              </li>
            )
          }
        )}
      </ul>
    </section>
  )
}

export default UnifiedIngredientList
