import { memo, useCallback, useMemo, useState } from 'react'
import { Pressable, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { RecipeOut } from '@carrot/shared/types'
import { TooltipPopover } from '../../components/NutritionBoxGrid'
import { MacroStrip, type MacroStripItem } from '../../components/ui'
import { formatCookingTime } from './helpers'
import { styles } from './styles'

const ESTIMATED_MARKER = '≈'
const MISSING_VALUE = '–'

const withUnit = (value: number | null, unit: string) => (value === null ? null : `${value}${unit}`)

const NutritionStrip = ({ recipe }: { recipe: RecipeOut }) => {
  const { t } = useTranslation()
  const [tooltipOpen, setTooltipOpen] = useState(false)

  const {
    total_time_minutes: totalTime,
    total_time_provenance: timeProvenance,
    nutrition_provenance: provenance,
    kcal_per_serving: kcal,
    protein_per_serving: protein,
    fat_per_serving: fat,
    carbs_per_serving: carbs,
  } = recipe

  const items = useMemo<MacroStripItem[]>(
    () => [
      {
        key: 'time',
        label: t('recipes.totalTime'),
        value: formatCookingTime(totalTime, t),
        estimated: timeProvenance?.status === 'ai',
      },
      { key: 'kcal', label: t('recipes.colKcal'), value: kcal?.toString() ?? null, estimated: provenance?.kcal_per_serving?.status === 'ai' },
      { key: 'protein', label: t('recipes.protein'), value: withUnit(protein, 'g'), estimated: provenance?.protein_per_serving?.status === 'ai' },
      { key: 'fat', label: t('recipes.fat'), value: withUnit(fat, 'g'), estimated: provenance?.fat_per_serving?.status === 'ai' },
      { key: 'carbs', label: t('recipes.carbs'), value: withUnit(carbs, 'g'), estimated: provenance?.carbs_per_serving?.status === 'ai' },
    ],
    [t, totalTime, timeProvenance, kcal, protein, fat, carbs, provenance],
  )

  const hasEstimate = items.some((item) => item.estimated && item.value)

  const accessibilityLabel = useMemo(
    () =>
      items
        .map((item) => {
          const estimate = item.estimated && item.value ? ` (${t('recipes.valueAi')})` : ''

          return `${item.label}: ${item.value ?? MISSING_VALUE}${estimate}`
        })
        .join(', '),
    [items, t],
  )

  const handleToggle = useCallback(() => setTooltipOpen((open) => !open), [])
  const handleDismiss = useCallback(() => setTooltipOpen(false), [])

  const strip = <MacroStrip items={items} estimatedMarker={ESTIMATED_MARKER} missingValue={MISSING_VALUE} />

  if (!hasEstimate) {
    return (
      <View accessible accessibilityLabel={accessibilityLabel}>
        {strip}
      </View>
    )
  }

  return (
    <View style={tooltipOpen ? styles.raised : undefined}>
      <Pressable
        onPress={handleToggle}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={t('recipes.nutritionEstimateDisclaimer')}
      >
        {strip}
      </Pressable>
      {tooltipOpen ? (
        <TooltipPopover text={t('recipes.nutritionEstimateDisclaimer')} alignRight={false} onDismiss={handleDismiss} />
      ) : null}
    </View>
  )
}

export default memo(NutritionStrip)
