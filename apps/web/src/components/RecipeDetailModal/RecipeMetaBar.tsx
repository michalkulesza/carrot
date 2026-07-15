import { Type } from 'react-feather'
import { useTranslation } from 'react-i18next'
import type { RecipeOut } from '@carrot/shared/types'
import HouseholdAvatarIndicators from '../HouseholdAvatarIndicators'
import NutritionBoxGrid from '../NutritionBoxGrid'
import { getHeaderBg, type EditState, type Mode } from './helpers'
import ServingStepper from './ServingStepper'

type NutritionField =
  | 'servings'
  | 'totalTimeMinutes'
  | 'kcal'
  | 'protein'
  | 'fat'
  | 'carbs'
const NUTRITION_FIELDS: readonly NutritionField[] = [
  'totalTimeMinutes',
  'servings',
  'kcal',
  'protein',
  'fat',
  'carbs',
]

interface RecipeMetaBarProps {
  recipe: RecipeOut
  draft: EditState
  mode: Mode
  onNutritionChange: (field: NutritionField, value: string) => void
  debugMode: boolean
  wakeLockActive: boolean
  onToggleWakeLock: () => void
  fontSizeIndex: number
  onFontSizeChange: (index: number) => void
  onCancelMode: () => void
  selectedServings: number | null
  onDecreaseServings: () => void
  onIncreaseServings: () => void
}

const TEXT_SIZES = [14, 16, 17, 20, 22] as const

const formatCookingTime = (
  minutes: number | null,
  t: (key: string) => string
) => {
  if (minutes === null) return ''
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (hours === 0) return `${minutes} ${t('recipes.minutesShort')}`
  if (remainingMinutes === 0) return `${hours} ${t('recipes.hoursShort')}`

  return `${hours} ${t('recipes.hoursShort')} ${remainingMinutes} ${t('recipes.minutesShort')}`
}

const RecipeMetaBar = ({
  recipe,
  draft,
  mode,
  onNutritionChange,
  debugMode,
  wakeLockActive,
  onToggleWakeLock,
  fontSizeIndex,
  onFontSizeChange,
  onCancelMode,
  selectedServings,
  onDecreaseServings,
  onIncreaseServings,
}: RecipeMetaBarProps) => {
  const { t } = useTranslation()
  const r = recipe
  const headerBg = getHeaderBg(mode)
  const editing = mode === 'editing'
  const hasScalableServings = recipe.servings !== null && recipe.servings > 0

  const nutritionItems = [
    {
      label: editing ? t('recipes.totalTimeMinutes') : t('recipes.totalTime'),
      value: editing
        ? draft.totalTimeMinutes
        : formatCookingTime(r.total_time_minutes, t),
      accessibilityLabel: t('recipes.totalTime'),
      showDisclaimer: false,
    },
    {
      label: t('recipes.serves'),
      value: editing ? draft.servings : (r.servings?.toString() ?? ''),
      accessibilityLabel: t('recipes.serves'),
    },
    {
      label: t('recipes.colKcal'),
      value: editing ? draft.kcal : (r.kcal_per_serving?.toString() ?? ''),
      accessibilityLabel: t('recipes.kcalPerServing'),
    },
    {
      label: t('recipes.protein'),
      value: editing
        ? draft.protein
        : (r.protein_per_serving?.toString() ?? ''),
      accessibilityLabel: t('recipes.proteinPerServing'),
    },
    {
      label: t('recipes.fat'),
      value: editing ? draft.fat : (r.fat_per_serving?.toString() ?? ''),
      accessibilityLabel: t('recipes.fatPerServing'),
    },
    {
      label: t('recipes.carbs'),
      value: editing ? draft.carbs : (r.carbs_per_serving?.toString() ?? ''),
      accessibilityLabel: t('recipes.carbsPerServing'),
    },
  ]
  const visibleNutritionItems = editing
    ? nutritionItems
    : [nutritionItems[0], ...nutritionItems.slice(2)]

  const handleNutritionChangeValue = (index: number, value: string) => {
    onNutritionChange(NUTRITION_FIELDS[index], value)
  }

  return (
    <div className={`px-5 pt-5 pb-0 flex flex-col gap-2 ${headerBg}`}>
      <NutritionBoxGrid
        editing={editing}
        items={visibleNutritionItems}
        onChangeValue={handleNutritionChangeValue}
        disclaimerText={t('recipes.nutritionEstimateDisclaimer')}
      />
      {mode === 'view' && hasScalableServings && selectedServings !== null && (
        <ServingStepper
          servings={selectedServings}
          onDecrease={onDecreaseServings}
          onIncrease={onIncreaseServings}
        />
      )}
      <HouseholdAvatarIndicators recipe={r} />

      {debugMode && r.debug_model && (
        <div className="flex flex-col gap-0.5 rounded-lg bg-zinc-50 px-3 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
            {t('recipes.debugInfo')}
          </span>
          <span className="text-xs text-zinc-500">
            {t('recipes.debugModel')}: {r.debug_model}
          </span>
          <span className="text-xs text-zinc-500">
            {t('recipes.debugTokens')}: {r.debug_total_tokens ?? '—'} (
            {t('recipes.debugInputTokens')} {r.debug_input_tokens ?? '—'}
            {' · '}
            {t('recipes.debugOutputTokens')} {r.debug_output_tokens ?? '—'})
          </span>
        </div>
      )}

      {mode === 'view' && (
        <div className="border-y border-zinc-200 divide-y divide-zinc-200">
          {'wakeLock' in navigator && (
            <div className="flex items-center justify-between py-2.5">
              <span className="text-sm text-zinc-700">
                {t('settings.cookingMode')}
              </span>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={wakeLockActive}
                  onChange={onToggleWakeLock}
                  className="peer sr-only"
                  aria-label={t('settings.cookingMode')}
                />
                <span className="h-6 w-11 rounded-full bg-zinc-200 transition-colors peer-checked:bg-primary peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-5" />
              </label>
            </div>
          )}
          <label className="flex items-center justify-between gap-4 py-2.5">
            <span className="text-sm text-zinc-700">
              {t('settings.textSize')}
            </span>
            <div className="flex items-center gap-2 text-zinc-500">
              <Type className="h-3.5 w-3.5" aria-hidden="true" />
              <input
                type="range"
                min="0"
                max={TEXT_SIZES.length - 1}
                step="1"
                value={fontSizeIndex}
                onChange={(e) => onFontSizeChange(Number(e.target.value))}
                aria-label={t('settings.textSize')}
                className="w-28 accent-primary"
              />
              <Type className="h-5 w-5" aria-hidden="true" />
            </div>
          </label>
        </div>
      )}
      {mode === 'editing' && (
        <div className="flex items-center gap-2 pt-0.5">
          <button
            type="button"
            onClick={onCancelMode}
            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-warning text-warning-foreground hover:bg-warning-400 transition-colors"
          >
            ✎ {t('recipes.editingTapToCancel')}
          </button>
        </div>
      )}
      {mode === 'confirming' && (
        <div className="flex items-center gap-2 pt-0.5">
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-danger text-danger-foreground">
            {t('recipes.deleteThisRecipe')}
          </span>
        </div>
      )}
    </div>
  )
}

export default RecipeMetaBar
