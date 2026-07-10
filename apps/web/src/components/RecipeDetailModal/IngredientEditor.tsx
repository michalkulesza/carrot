import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UNITS } from '../../api/client'
import {
  parseIngredient,
  serializeIngredient,
  type StructuredIngredient,
} from './helpers'

interface IngredientEditorProps {
  value: string
  onChange: (v: string) => void
}

const IngredientEditor = ({ value, onChange }: IngredientEditorProps) => {
  const { t } = useTranslation()
  const [parts, setParts] = useState<StructuredIngredient>(() =>
    parseIngredient(value)
  )
  const inputBase =
    'bg-transparent border-b border-transparent hover:border-zinc-300 focus:border-primary focus:outline-none transition-colors text-sm'

  const update = (field: keyof StructuredIngredient, val: string) => {
    const next = { ...parts, [field]: val }
    setParts(next)
    onChange(serializeIngredient(next))
  }

  return (
    <div className="flex items-center gap-1 flex-1 min-w-0">
      <input
        type="text"
        value={parts.qty}
        onChange={(e) => update('qty', e.target.value)}
        placeholder={t('units.qtyLabel')}
        aria-label={t('units.qtyLabel')}
        className={`${inputBase} w-10 text-center shrink-0`}
      />
      <select
        value={parts.unit}
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
        value={parts.name}
        onChange={(e) => update('name', e.target.value)}
        aria-label="ingredient name"
        className={`${inputBase} flex-1 min-w-0`}
      />
    </div>
  )
}

export default IngredientEditor
