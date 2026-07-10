import { useTranslation } from 'react-i18next'
import { clampToString, type EditableRecipe } from './helpers'

interface RecipeMacroPillsProps {
  recipe: EditableRecipe
  setServings: (v: string) => void
  setKcal: (v: string) => void
  setProtein: (v: string) => void
  setFat: (v: string) => void
  setCarbs: (v: string) => void
}

const numberInputClass =
  'bg-transparent font-semibold text-xs text-center focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'

const RecipeMacroPills = ({
  recipe,
  setServings,
  setKcal,
  setProtein,
  setFat,
  setCarbs,
}: RecipeMacroPillsProps) => {
  const { t } = useTranslation()

  const hasAnyMacro =
    recipe.servings !== '' ||
    recipe.kcal !== '' ||
    recipe.protein !== '' ||
    recipe.fat !== '' ||
    recipe.carbs !== ''
  if (!hasAnyMacro) return null

  return (
    <div className="flex gap-2 flex-wrap">
      {recipe.servings !== '' && (
        <label className="flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-medium pl-3 pr-2 py-1.5 rounded-full cursor-text">
          <span>{t('recipes.serves')}</span>
          <input
            type="number"
            min={1}
            max={67}
            value={recipe.servings}
            onChange={(e) => setServings(clampToString(e.target.value, 1, 67))}
            className={`${numberInputClass} w-[2.2ch] text-primary`}
          />
        </label>
      )}
      {recipe.kcal !== '' && (
        <label className="flex items-center gap-1.5 bg-warning/10 text-warning-700 text-xs font-medium pl-2 pr-3 py-1.5 rounded-full cursor-text">
          <input
            type="number"
            min={1}
            max={9999}
            value={recipe.kcal}
            onChange={(e) => setKcal(clampToString(e.target.value, 1, 9999))}
            className={`${numberInputClass} w-[3.8ch] text-warning-700`}
          />
          <span>{t('recipes.kcalPerServing')}</span>
        </label>
      )}
      {recipe.protein !== '' && (
        <label className="flex items-center gap-1.5 bg-zinc-100 text-zinc-600 text-xs font-medium pl-2 pr-3 py-1.5 rounded-full cursor-text">
          <input
            type="number"
            min={0}
            max={999}
            value={recipe.protein}
            onChange={(e) => setProtein(clampToString(e.target.value, 0, 999))}
            className={`${numberInputClass} w-[3ch] text-zinc-600`}
          />
          <span>{t('recipes.proteinPerServing')}</span>
        </label>
      )}
      {recipe.fat !== '' && (
        <label className="flex items-center gap-1.5 bg-zinc-100 text-zinc-600 text-xs font-medium pl-2 pr-3 py-1.5 rounded-full cursor-text">
          <input
            type="number"
            min={0}
            max={999}
            value={recipe.fat}
            onChange={(e) => setFat(clampToString(e.target.value, 0, 999))}
            className={`${numberInputClass} w-[3ch] text-zinc-600`}
          />
          <span>{t('recipes.fatPerServing')}</span>
        </label>
      )}
      {recipe.carbs !== '' && (
        <label className="flex items-center gap-1.5 bg-zinc-100 text-zinc-600 text-xs font-medium pl-2 pr-3 py-1.5 rounded-full cursor-text">
          <input
            type="number"
            min={0}
            max={999}
            value={recipe.carbs}
            onChange={(e) => setCarbs(clampToString(e.target.value, 0, 999))}
            className={`${numberInputClass} w-[3ch] text-zinc-600`}
          />
          <span>{t('recipes.carbsPerServing')}</span>
        </label>
      )}
    </div>
  )
}

export default RecipeMacroPills
