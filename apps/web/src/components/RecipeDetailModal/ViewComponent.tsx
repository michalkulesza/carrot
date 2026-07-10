import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { SaveComponent, StepIngredientRef } from '@carrot/shared/types'
import { computeClientStepIngredientRefs, displayIngredient } from './helpers'
import AllergenPopover from './AllergenPopover'
import StepText from './StepText'

interface ViewComponentProps {
  comp: SaveComponent
  single: boolean
  activeAllergens: string[]
  onReplaceIngredient: (ii: number) => void
  onRestoreIngredient: (ii: number) => void
  recipeId: string
  recipeTitle: string
  componentIndex: number
  addMode?: boolean
  sessionAdded?: Set<string>
  onAddIngredient?: (ii: number) => void
  onAddAllIngredients?: () => void
}

const ViewComponent = ({
  comp,
  single,
  activeAllergens,
  onReplaceIngredient,
  onRestoreIngredient,
  recipeId,
  recipeTitle,
  componentIndex,
  addMode = false,
  sessionAdded,
  onAddIngredient,
  onAddAllIngredients,
}: ViewComponentProps) => {
  const { t } = useTranslation()

  const clientRefs = useMemo<StepIngredientRef[][] | null>(() => {
    if (comp.step_ingredient_refs != null) return null

    return computeClientStepIngredientRefs(comp)
  }, [comp.step_ingredient_refs, comp.ingredients, comp.steps])

  const allIngredientsAdded = comp.ingredients.every((_, i) =>
    sessionAdded?.has(`${componentIndex}-${i}`)
  )

  return (
    <div className="mb-5">
      {!single && (
        <h3 className="text-sm font-semibold text-zinc-600 mb-2">
          {comp.name}
        </h3>
      )}
      {comp.ingredients.length > 0 && (
        <>
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
          <ul className="space-y-1 mb-3">
            {comp.ingredients.map((ing, i) => {
              const flag = comp.ingredient_flags?.[i]
              const added = sessionAdded?.has(`${componentIndex}-${i}`) ?? false
              const addButtonLabel = added
                ? t('shoppingList.addedToList')
                : t('shoppingList.addToList')

              return (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-zinc-300 mt-1 shrink-0">·</span>
                  <span className="flex-1">{displayIngredient(ing, t)}</span>
                  {flag && (
                    <AllergenPopover
                      flag={flag}
                      activeAllergens={activeAllergens}
                      onReplace={() => onReplaceIngredient(i)}
                      onRestore={() => onRestoreIngredient(i)}
                    />
                  )}
                  {addMode && (
                    <button
                      type="button"
                      onClick={added ? undefined : () => onAddIngredient?.(i)}
                      aria-label={addButtonLabel}
                      className={`shrink-0 -mt-0.5 -mr-1 flex items-center justify-center w-7 h-7 rounded-full transition-colors ${
                        added
                          ? 'text-emerald-500 cursor-default'
                          : 'text-primary hover:bg-primary/10 hover:text-primary-600 cursor-pointer'
                      }`}
                    >
                      {added ? (
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                        >
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      ) : (
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      )}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
      {comp.steps.length > 0 && (
        <>
          <p className="text-xs font-semibold uppercase text-zinc-400 mb-1">
            {t('recipes.steps')}
          </p>
          <ol className="space-y-2">
            {comp.steps.map((step, i) => {
              const timerId = `${recipeId}-c${componentIndex}-s${i}`
              const stepRefs =
                comp.step_ingredient_refs?.[i] ?? clientRefs?.[i] ?? []

              return (
                <li
                  key={i}
                  id={`timer-step-${componentIndex}-${i}`}
                  className="flex items-start gap-2 text-sm transition-colors duration-300"
                >
                  <span className="text-zinc-400 font-medium shrink-0">
                    {i + 1}.
                  </span>
                  <StepText
                    step={step}
                    stepRefs={stepRefs}
                    ingredients={comp.ingredients}
                    timerId={timerId}
                    recipeId={recipeId}
                    recipeTitle={recipeTitle}
                    componentIndex={componentIndex}
                    stepIndex={i}
                  />
                </li>
              )
            })}
          </ol>
        </>
      )}
    </div>
  )
}

export default ViewComponent
