import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { RecipeOut } from '@carrot/shared/types'
import PopupStepper from './PopupStepper'

interface RecipeSpecSheetProps {
  recipe: RecipeOut
  selectedServings: number | null
  onDecreaseServings: () => void
  onIncreaseServings: () => void
  wakeLockActive: boolean
  onToggleWakeLock: () => void
  desktop: boolean
}

const MACRO_COLORS = ['#7C6AE0', '#F0A43A', '#E8894A'] as const

const SpecRow = ({
  label,
  desktop,
  children,
}: {
  label: string
  desktop: boolean
  children: ReactNode
}) => (
  <div
    className={`flex items-center justify-between border-b border-[#ECEAF0] ${
      desktop ? 'py-2.5' : 'min-h-12 py-1.5'
    }`}
  >
    <span
      className={`font-semibold text-[#6B6A78] ${desktop ? 'text-sm' : 'text-[15px]'}`}
    >
      {label}
    </span>
    {children}
  </div>
)

const RecipeSpecSheet = ({
  recipe,
  selectedServings,
  onDecreaseServings,
  onIncreaseServings,
  wakeLockActive,
  onToggleWakeLock,
  desktop,
}: RecipeSpecSheetProps) => {
  const { t } = useTranslation()
  const minutes = recipe.total_time_minutes
  const hours = minutes === null ? 0 : Math.floor(minutes / 60)
  const timeLabel =
    minutes === null
      ? ''
      : hours === 0
        ? t('recipes.durationMin', { count: minutes })
        : [
            t('recipes.durationHour', { count: hours }),
            minutes % 60 > 0
              ? t('recipes.durationMin', { count: minutes % 60 })
              : '',
          ]
            .filter(Boolean)
            .join(' ')
  const macros = [
    { label: t('recipes.protein'), grams: recipe.protein_per_serving },
    { label: t('recipes.fat'), grams: recipe.fat_per_serving },
    { label: t('recipes.carbs'), grams: recipe.carbs_per_serving },
  ]
  const macroTotal = macros.reduce((sum, macro) => sum + (macro.grams ?? 0), 0)
  const hasServings = recipe.servings !== null && recipe.servings > 0
  const value = desktop ? 'text-[15px]' : 'text-base'

  return (
    <div className="flex flex-col border-t border-[#ECEAF0]">
      {minutes !== null && (
        <SpecRow label={t('recipes.totalTime')} desktop={desktop}>
          <span className={`font-extrabold ${value}`}>{timeLabel}</span>
        </SpecRow>
      )}
      {recipe.kcal_per_serving !== null && (
        <SpecRow label={t('recipes.calories')} desktop={desktop}>
          <span className={`font-extrabold ${value}`}>
            {recipe.kcal_per_serving} kcal
          </span>
        </SpecRow>
      )}
      {macroTotal > 0 && (
        <div
          className={`flex flex-col gap-2 border-b border-[#ECEAF0] ${
            desktop ? 'pb-3 pt-2.5' : 'pb-3.5 pt-3'
          }`}
        >
          <div className="flex justify-between">
            <span
              className={`font-semibold text-[#6B6A78] ${desktop ? 'text-sm' : 'text-[15px]'}`}
            >
              {t('recipes.macros')}
            </span>
            <span className="text-[13px] font-semibold text-[#8C8A99]">
              {t('recipes.perServing')}
            </span>
          </div>
          <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
            {macros.map((macro, i) => (
              <div
                key={macro.label}
                style={{ flex: macro.grams ?? 0, background: MACRO_COLORS[i] }}
              />
            ))}
          </div>
          <div className="flex justify-between text-[13px] font-bold">
            {macros.map((macro, i) => (
              <span key={macro.label} className="flex items-center gap-[5px]">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: MACRO_COLORS[i] }}
                />
                {macro.label} {macro.grams ?? 0}g
              </span>
            ))}
          </div>
        </div>
      )}
      {hasServings && selectedServings !== null && (
        <SpecRow label={t('recipes.serves')} desktop={desktop}>
          <PopupStepper
            servings={selectedServings}
            onDecrease={onDecreaseServings}
            onIncrease={onIncreaseServings}
            desktop={desktop}
          />
        </SpecRow>
      )}
      {'wakeLock' in navigator && (
        <div
          className={`flex items-center justify-between border-b border-[#ECEAF0] ${
            desktop ? 'py-2.5' : 'min-h-[60px] gap-3'
          }`}
        >
          <div className="flex flex-col">
            <span
              className={
                desktop
                  ? 'text-sm font-semibold text-[#6B6A78]'
                  : 'text-[15px] font-bold text-[#1F1D2B]'
              }
            >
              {t('settings.screenAwake')}
            </span>
            <span
              className={`text-[#8C8A99] ${desktop ? 'text-xs' : 'text-[13px]'}`}
            >
              {t('recipes.screenAwakeHint')}
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={wakeLockActive}
            aria-label={t('settings.screenAwake')}
            onClick={onToggleWakeLock}
            className={`relative shrink-0 rounded-full transition-colors duration-200 ${
              desktop ? 'h-[22px] w-10' : 'h-7 w-12'
            } ${wakeLockActive ? 'bg-[#E8894A]' : 'bg-[#DDD9E4]'}`}
          >
            <span
              className={`absolute left-0.5 top-0.5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.2)] transition-transform duration-200 ${
                desktop ? 'h-[18px] w-[18px]' : 'h-6 w-6'
              } ${
                wakeLockActive
                  ? desktop
                    ? 'translate-x-[18px]'
                    : 'translate-x-5'
                  : ''
              }`}
            />
          </button>
        </div>
      )}
    </div>
  )
}

export default RecipeSpecSheet
