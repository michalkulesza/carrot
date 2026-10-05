import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { EditState } from './helpers'
import type { DraftTextField } from './useRecipeDraft'

interface EditSpecSheetProps {
  draft: EditState
  onField: (field: DraftTextField, value: string) => void
}

const MACROS = [
  { field: 'protein', labelKey: 'recipes.protein', color: 'bg-[#7C6AE0]' },
  { field: 'fat', labelKey: 'recipes.fat', color: 'bg-[#F0A43A]' },
  { field: 'carbs', labelKey: 'recipes.carbs', color: 'bg-[#E8894A]' },
] as const

const FIELD_FOCUS =
  'focus-within:border-[#E8894A] focus-within:ring-[3px] focus-within:ring-[#FDEFE4]'

// Number-only text so typing stays free-form; the draft keeps it as a string.
const sanitizeNumber = (value: string) => value.replace(/[^\d.]/g, '')

const NumberInput = ({
  value,
  onChange,
  label,
  className = '',
}: {
  value: string
  onChange: (value: string) => void
  label: string
  className?: string
}) => (
  <input
    type="text"
    inputMode="decimal"
    aria-label={label}
    value={value}
    onChange={(event) => onChange(sanitizeNumber(event.target.value))}
    className={`min-w-0 bg-transparent font-extrabold text-[#1F1D2B] outline-none ${className}`}
  />
)

const SpecRow = ({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) => (
  <div className="flex min-h-14 items-center justify-between border-b border-[#ECEAF0] lg:min-h-[52px]">
    <span className="text-[15px] font-semibold text-[#6B6A78] lg:text-sm">
      {label}
    </span>
    {children}
  </div>
)

const UnitField = ({
  value,
  onChange,
  label,
  unit,
}: {
  value: string
  onChange: (value: string) => void
  label: string
  unit: string
}) => (
  <div className="flex items-center gap-2">
    <div
      className={`flex h-11 w-[76px] items-center rounded-[10px] border border-[#ECEAF0] px-3 lg:h-9 lg:w-16 lg:rounded-lg lg:px-2.5 ${FIELD_FOCUS}`}
    >
      <NumberInput
        value={value}
        onChange={onChange}
        label={label}
        className="w-full text-right text-base lg:text-[15px]"
      />
    </div>
    <span className="w-8 text-sm font-semibold text-[#8C8A99] lg:w-[30px]">
      {unit}
    </span>
  </div>
)

const ServesStepper = ({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) => {
  const { t } = useTranslation()
  const servings = Number(value) || 0
  const button =
    'flex h-11 w-11 items-center justify-center rounded-[10px] text-[22px] font-extrabold text-[#E07B39] hover:bg-[#FDEFE4] lg:h-8 lg:w-8 lg:rounded-lg lg:text-lg'

  return (
    <div className="flex items-center">
      <button
        type="button"
        aria-label={t('recipes.decreaseServings')}
        onClick={() => onChange(String(Math.max(1, servings - 1)))}
        className={button}
      >
        −
      </button>
      <span className="w-7 text-center text-[17px] font-extrabold lg:text-[15px]">
        {value === '' ? '—' : value}
      </span>
      <button
        type="button"
        aria-label={t('recipes.increaseServings')}
        onClick={() => onChange(String(Math.min(99, servings + 1)))}
        className={button}
      >
        +
      </button>
    </div>
  )
}

const EditSpecSheet = ({ draft, onField }: EditSpecSheetProps) => {
  const { t } = useTranslation()
  const macroTotal = MACROS.reduce(
    (sum, { field }) => sum + (Number(draft[field]) || 0),
    0
  )

  return (
    <div className="flex flex-col border-t border-[#ECEAF0]">
      <SpecRow label={t('recipes.totalTime')}>
        <UnitField
          value={draft.totalTimeMinutes}
          onChange={(value) => onField('totalTimeMinutes', value)}
          label={t('recipes.totalTimeMinutes')}
          unit={t('recipes.minUnit')}
        />
      </SpecRow>
      <SpecRow label={t('recipes.calories')}>
        <UnitField
          value={draft.kcal}
          onChange={(value) => onField('kcal', value)}
          label={t('recipes.calories')}
          unit="kcal"
        />
      </SpecRow>
      <div className="flex flex-col gap-2.5 border-b border-[#ECEAF0] pb-3.5 pt-3">
        <div className="flex justify-between">
          <span className="text-[15px] font-semibold text-[#6B6A78] lg:text-sm">
            {t('recipes.macros')}
          </span>
          <span className="text-[13px] font-semibold text-[#8C8A99]">
            {t('recipes.perServing')}
          </span>
        </div>
        <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-[#F4F3F7]">
          {MACROS.map(({ field, color }) => (
            <div
              key={field}
              className={`${color} transition-[flex] duration-200`}
              style={{ flex: (Number(draft[field]) || 0) / (macroTotal || 1) }}
            />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {MACROS.map(({ field, labelKey, color }) => (
            <label key={field} className="flex flex-col gap-1">
              <span className="flex items-center gap-[5px] text-xs font-bold text-[#4A4858]">
                <span className={`h-2 w-2 rounded-full ${color}`} />
                {t(labelKey)}
              </span>
              <div
                className={`flex h-11 items-center rounded-[10px] border border-[#ECEAF0] px-3 lg:h-9 lg:rounded-lg lg:px-2.5 ${FIELD_FOCUS}`}
              >
                <NumberInput
                  value={draft[field]}
                  onChange={(value) => onField(field, value)}
                  label={t(labelKey)}
                  className="w-full text-base lg:text-[15px]"
                />
                <span className="text-[13px] font-semibold text-[#8C8A99]">
                  g
                </span>
              </div>
            </label>
          ))}
        </div>
      </div>
      <SpecRow label={t('recipes.serves')}>
        <ServesStepper
          value={draft.servings}
          onChange={(value) => onField('servings', value)}
        />
      </SpecRow>
    </div>
  )
}

export default EditSpecSheet
