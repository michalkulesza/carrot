import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SaveComponent } from '@carrot/shared/types'
import { UNITS } from '../../api/client'
import {
  parseIngredient,
  serializeIngredient,
  type StructuredIngredient,
} from './helpers'
import { AddRowButton, CloseGlyph, GripIcon } from './EditControls'

interface EditIngredientsProps {
  component: SaveComponent
  componentIndex: number
  textMode: boolean
  onChange: (ci: number, ii: number, value: string) => void
  onAdd: (ci: number) => void
  onRemove: (ci: number, ii: number) => void
  onReplaceAll: (ci: number, lines: string[]) => void
}

const CELL =
  'h-11 min-w-0 rounded-[10px] border border-[#ECEAF0] bg-white text-[#1F1D2B] outline-none focus:border-[#E8894A] focus:ring-[3px] focus:ring-[#FDEFE4] lg:h-[38px] lg:rounded-lg'

const IngredientRow = ({
  value,
  onChange,
  onRemove,
}: {
  value: string
  onChange: (value: string) => void
  onRemove: () => void
}) => {
  const { t } = useTranslation()
  const [parts, setParts] = useState<StructuredIngredient>(() =>
    parseIngredient(value)
  )

  // Local parts keep half-typed input (e.g. "1 ") from being normalised away;
  // external changes (removals, pasted text) still win.
  useEffect(() => {
    if (serializeIngredient(parts) !== value) setParts(parseIngredient(value))
  }, [value])

  const update = (field: keyof StructuredIngredient, next: string) => {
    const nextParts = { ...parts, [field]: next }
    setParts(nextParts)
    onChange(serializeIngredient(nextParts))
  }

  return (
    <div className="grid grid-cols-[12px_52px_72px_minmax(0,1fr)_32px] items-center gap-1.5 lg:grid-cols-[20px_64px_104px_minmax(0,1fr)_32px] lg:gap-2">
      <GripIcon className="mx-auto" />
      <input
        value={parts.qty}
        onChange={(event) => update('qty', event.target.value)}
        placeholder="—"
        aria-label={t('units.qtyLabel')}
        className={`${CELL} px-1.5 text-center text-base font-extrabold lg:px-2.5 lg:text-[15px]`}
      />
      <select
        value={parts.unit}
        onChange={(event) => update('unit', event.target.value)}
        aria-label={t('units.unitLabel')}
        className={`${CELL} cursor-pointer px-1 text-[15px] font-bold lg:px-2 lg:text-sm ${
          parts.unit ? '' : 'text-[#A9A6B4]'
        }`}
      >
        <option value="">—</option>
        {UNITS.map((unit) => (
          <option key={unit} value={unit}>
            {unit}
          </option>
        ))}
      </select>
      <input
        value={parts.name}
        onChange={(event) => update('name', event.target.value)}
        placeholder={t('recipes.ingredientPlaceholder')}
        aria-label={t('recipes.ingredientPlaceholder')}
        className={`${CELL} px-2.5 text-base lg:px-3 lg:text-[15px]`}
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label={t('common.remove')}
        className="flex h-11 w-8 items-center justify-center rounded-lg text-[#A9A6B4] hover:bg-[#FDE8E8] hover:text-[#C53030] lg:h-8"
      >
        <CloseGlyph size={14} />
      </button>
    </div>
  )
}

const PasteArea = ({
  initial,
  onLines,
}: {
  initial: string[]
  onLines: (lines: string[]) => void
}) => {
  const { t } = useTranslation()
  const [raw, setRaw] = useState(() => initial.join('\n'))

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={raw}
        onChange={(event) => {
          setRaw(event.target.value)
          onLines(
            event.target.value
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line) => serializeIngredient(parseIngredient(line)))
          )
        }}
        className="min-h-[360px] w-full resize-none rounded-xl border border-[#ECEAF0] px-3.5 py-3 text-base leading-[1.65] text-[#1F1D2B] outline-none focus:border-[#E8894A] focus:ring-[3px] focus:ring-[#FDEFE4] lg:min-h-[340px] lg:resize-y lg:px-4 lg:py-3.5 lg:text-[15px] lg:leading-[1.7]"
      />
      <span className="text-[13px] font-semibold text-[#8C8A99]">
        {t('recipes.pasteTextHint')}
      </span>
    </div>
  )
}

const EditIngredients = ({
  component,
  componentIndex,
  textMode,
  onChange,
  onAdd,
  onRemove,
  onReplaceAll,
}: EditIngredientsProps) => {
  const { t } = useTranslation()

  if (textMode) {
    return (
      <PasteArea
        initial={component.ingredients}
        onLines={(lines) => onReplaceAll(componentIndex, lines)}
      />
    )
  }

  return (
    <div className="flex flex-col gap-2 lg:gap-1.5">
      {component.ingredients.map((ingredient, index) => (
        <IngredientRow
          key={index}
          value={ingredient}
          onChange={(value) => onChange(componentIndex, index, value)}
          onRemove={() => onRemove(componentIndex, index)}
        />
      ))}
      <AddRowButton
        onClick={() => onAdd(componentIndex)}
        className="h-12 lg:ml-7 lg:mr-10 lg:h-10 lg:rounded-[10px]"
      >
        + {t('recipes.addIngredient')}
      </AddRowButton>
    </div>
  )
}

export default EditIngredients
