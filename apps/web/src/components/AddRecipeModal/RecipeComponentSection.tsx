import { useTranslation } from 'react-i18next'
import AllergenPopover from './AllergenPopover'
import EditLine from './EditLine'
import IngredientEditor from './IngredientEditor'
import type { EditableComponent, StructuredIngredient } from './helpers'

interface RecipeComponentSectionProps {
  component: EditableComponent
  showName: boolean
  activeAllergens: string[]
  onIngredientChange: (
    ingredientIndex: number,
    value: StructuredIngredient
  ) => void
  onStepChange: (stepIndex: number, value: string) => void
  onAllergenReplace: (ingredientIndex: number) => void
  onAllergenRestore: (ingredientIndex: number) => void
}

const RecipeComponentSection = ({
  component,
  showName,
  activeAllergens,
  onIngredientChange,
  onStepChange,
  onAllergenReplace,
  onAllergenRestore,
}: RecipeComponentSectionProps) => {
  const { t } = useTranslation()

  return (
    <div className="mb-5">
      {showName && (
        <h3 className="text-sm font-semibold text-zinc-600 mb-2">
          {component.name}
        </h3>
      )}

      {component.ingredients.length > 0 && (
        <>
          <p className="text-xs font-semibold uppercase text-zinc-400 mb-1">
            {t('recipes.sectionIngredients')}
          </p>
          <ul className="space-y-1 mb-3">
            {component.ingredients.map((ing, ii) => {
              const flag = component.ingredient_flags[ii]

              return (
                <li key={ii} className="flex items-start gap-2 text-sm">
                  <span className="text-zinc-300 mt-1.5 shrink-0">·</span>
                  <IngredientEditor
                    value={ing}
                    onChange={(v) => onIngredientChange(ii, v)}
                  />
                  {flag && (
                    <AllergenPopover
                      flag={flag}
                      activeAllergens={activeAllergens}
                      onReplace={() => onAllergenReplace(ii)}
                      onRestore={() => onAllergenRestore(ii)}
                    />
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}

      {component.steps.length > 0 && (
        <>
          <p className="text-xs font-semibold uppercase text-zinc-400 mb-1">
            {t('recipes.steps')}
          </p>
          <ol className="space-y-2">
            {component.steps.map((step, si) => (
              <li key={si} className="flex items-start gap-2 text-sm">
                <span className="text-zinc-400 font-medium shrink-0">
                  {si + 1}.
                </span>
                <EditLine
                  value={step}
                  onChange={(v) => onStepChange(si, v)}
                  multiline
                />
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  )
}

export default RecipeComponentSection
