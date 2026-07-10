import { useTranslation } from 'react-i18next'
import { UNITS } from '../../api/client'
import type { StructuredIngredient } from './helpers'

interface IngredientEditorProps {
  value: StructuredIngredient
  onChange: (v: StructuredIngredient) => void
}

const IngredientEditor = ({ value, onChange }: IngredientEditorProps) => {
  const { t } = useTranslation()
  const inputBase =
    'bg-transparent border-b border-transparent hover:border-zinc-300 focus:border-primary focus:outline-none transition-colors text-sm'

  const update = (field: keyof StructuredIngredient, val: string) => {
    onChange({ ...value, [field]: val })
  }

  return (
    <div className="flex items-center gap-1 flex-1 min-w-0">
      <input
        type="text"
        value={value.qty}
        onChange={(e) => update('qty', e.target.value)}
        placeholder={t('units.qtyLabel')}
        aria-label={t('units.qtyLabel')}
        className={`${inputBase} w-10 text-center shrink-0`}
      />
      <select
        value={value.unit}
        onChange={(e) => update('unit', e.target.value)}
        aria-label={t('units.unitLabel')}
        className={`${inputBase} shrink-0 cursor-pointer text-zinc-500 max-w-[7rem]`}
      >
        <option value="">—</option>
        {UNITS.map((u) => (
          <option key={u} value={u}>
            {t(`units.${u}`)}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={value.name}
        onChange={(e) => update('name', e.target.value)}
        aria-label={t('addRecipe.ingredientName')}
        className={`${inputBase} flex-1 min-w-0`}
      />
    </div>
  )
}

export default IngredientEditor
