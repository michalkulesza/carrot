import { useTranslation } from 'react-i18next'
import type { SaveComponent } from '@carrot/shared/types'
import EditLine from './EditLine'
import IngredientEditor from './IngredientEditor'

interface EditComponentProps {
  comp: SaveComponent
  single: boolean
  onIngredientChange: (ii: number, val: string) => void
  onStepChange: (si: number, val: string) => void
}

const EditComponent = ({
  comp,
  single,
  onIngredientChange,
  onStepChange,
}: EditComponentProps) => {
  const { t } = useTranslation()

  return (
    <div className="mb-5">
      {!single && (
        <h3 className="text-sm font-semibold text-zinc-600 mb-2">
          {comp.name}
        </h3>
      )}
      {comp.ingredients.length > 0 && (
        <>
          <p className="text-xs font-semibold uppercase text-zinc-400 mb-1">
            {t('recipes.sectionIngredients')}
          </p>
          <ul className="space-y-1 mb-3">
            {comp.ingredients.map((ing, ii) => (
              <li key={ii} className="flex items-start gap-2 text-sm">
                <span className="text-zinc-300 mt-1.5 shrink-0">·</span>
                <IngredientEditor
                  value={ing}
                  onChange={(v) => onIngredientChange(ii, v)}
                />
              </li>
            ))}
          </ul>
        </>
      )}
      {comp.steps.length > 0 && (
        <>
          <p className="text-xs font-semibold uppercase text-zinc-400 mb-1">
            {t('recipes.steps')}
          </p>
          <ol className="space-y-2">
            {comp.steps.map((step, si) => (
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

export default EditComponent
