import { memo, useCallback, useMemo, useState } from 'react'
import { LayoutChangeEvent, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { RecipeOut } from '@carrot/shared/types'
import { MACRO_STRIP_PADDING_X, MacroStrip, type MacroStripItem } from '../../components/ui'
import AiEstimatePopover from './AiEstimatePopover'
import { formatCookingTime } from './helpers'
import { styles } from './styles'

const MISSING_VALUE = '–'

const withUnit = (value: number | null, unit: string) => (value === null ? null : `${value}${unit}`)

const NutritionStrip = ({ recipe }: { recipe: RecipeOut }) => {
  const { t } = useTranslation()
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [stripWidth, setStripWidth] = useState(0)

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

  const handleEstimatePress = useCallback((index: number) => {
    setOpenIndex((current) => (current === index ? null : index))
  }, [])
  const handleDismiss = useCallback(() => setOpenIndex(null), [])
  const handleLayout = useCallback((event: LayoutChangeEvent) => setStripWidth(event.nativeEvent.layout.width), [])

  const cellWidth = (stripWidth - MACRO_STRIP_PADDING_X * 2) / items.length
  const caretCenterX = openIndex === null ? 0 : MACRO_STRIP_PADDING_X + cellWidth * (openIndex + 0.5)

  return (
    <View style={openIndex !== null ? styles.raised : undefined}>
      <MacroStrip
        items={items}
        missingValue={MISSING_VALUE}
        estimateAccessibilityLabel={t('recipes.aiEstimateShowDetails')}
        onEstimatePress={handleEstimatePress}
        onLayout={handleLayout}
      />
      {openIndex !== null ? <AiEstimatePopover caretCenterX={caretCenterX} onDismiss={handleDismiss} /> : null}
    </View>
  )
}

export default memo(NutritionStrip)
