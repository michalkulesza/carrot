import { Calendar, ShoppingCart, Sun } from 'react-feather'
import { useTranslation } from 'react-i18next'
import { Button } from '@heroui/react'
import type { RecipeOut } from '@carrot/shared/types'
import HouseholdAvatarIndicators from '../HouseholdAvatarIndicators'
import NutritionBoxGrid from '../NutritionBoxGrid'
import { getHeaderBg, type EditState, type Mode } from './helpers'

type NutritionField = 'servings' | 'kcal' | 'protein' | 'fat' | 'carbs'
const NUTRITION_FIELDS: readonly NutritionField[] = [
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
  addMode: boolean
  onToggleAddMode: () => void
  onOpenMealPlan: () => void
  wakeLockActive: boolean
  onToggleWakeLock: () => void
  onCancelMode: () => void
}

const RecipeMetaBar = ({
  recipe,
  draft,
  mode,
  onNutritionChange,
  debugMode,
  addMode,
  onToggleAddMode,
  onOpenMealPlan,
  wakeLockActive,
  onToggleWakeLock,
  onCancelMode,
}: RecipeMetaBarProps) => {
  const { t } = useTranslation()
  const r = recipe
  const headerBg = getHeaderBg(mode)
  const editing = mode === 'editing'

  const nutritionItems = [
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

  const handleNutritionChangeValue = (index: number, value: string) => {
    onNutritionChange(NUTRITION_FIELDS[index], value)
  }

  const wakeLockTitle = wakeLockActive
    ? t('recipes.screenAlwaysOnDisable')
    : t('recipes.keepScreenOnWhileReading')
  const wakeLockButtonClass = wakeLockActive
    ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
    : ''

  return (
    <div className={`px-5 pt-5 pb-3 flex flex-col gap-2 ${headerBg}`}>
      <NutritionBoxGrid
        editing={editing}
        items={nutritionItems}
        onChangeValue={handleNutritionChangeValue}
        disclaimerText={t('recipes.nutritionEstimateDisclaimer')}
      />
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
        <div className="flex gap-2 pt-0.5 items-center">
          <Button
            size="sm"
            variant={addMode ? 'primary' : 'secondary'}
            onPress={onToggleAddMode}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            {t('shoppingList.addToList')}
          </Button>
          <Button size="sm" variant="secondary" onPress={onOpenMealPlan}>
            <Calendar className="w-3.5 h-3.5" />
            {t('mealPlan.addToMealPlan')}
          </Button>
          {'wakeLock' in navigator && (
            <span className="ml-auto" title={wakeLockTitle}>
              <Button
                size="sm"
                variant="secondary"
                className={wakeLockButtonClass}
                onPress={onToggleWakeLock}
              >
                <Sun className="w-3.5 h-3.5" />
                {wakeLockActive ? t('recipes.screenOn') : t('recipes.keepOn')}
              </Button>
            </span>
          )}
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
