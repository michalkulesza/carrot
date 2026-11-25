import { memo, useCallback, useMemo } from 'react'
import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { AppText } from '../../components/ui'
import EditTextInput from './EditTextInput'
import { sanitizeNumber, type EditDraft, type NutritionField } from './helpers'
import { styles } from './styles'

interface EditStatsGridProps {
  values: Pick<EditDraft, NutritionField>
  onChange: (field: NutritionField, value: string) => void
}

interface StatCellProps {
  field: NutritionField
  value: string
  label: string
  accessibilityLabel: string
  divider: boolean
  onChange: (field: NutritionField, value: string) => void
}

const StatCell = ({ field, value, label, accessibilityLabel, divider, onChange }: StatCellProps) => {
  const handleChange = useCallback((text: string) => onChange(field, sanitizeNumber(text)), [onChange, field])

  const cellStyle = useMemo(() => [styles.editStatsCell, divider && styles.editStatsCellDivider], [divider])

  return (
    <View style={cellStyle}>
      <EditTextInput
        style={styles.editStatsInput}
        value={value}
        onChangeText={handleChange}
        keyboardType="number-pad"
        returnKeyType="done"
        autoCorrect={false}
        maxLength={5}
        placeholder="–"
        accessibilityLabel={accessibilityLabel}
      />
      <AppText variant="meta" tone="textSecondary" style={styles.editStatsLabel} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  )
}

const EditStatsGrid = ({ values, onChange }: EditStatsGridProps) => {
  const { t } = useTranslation()

  const cells = useMemo(
    () => [
      { field: 'totalTimeMinutes', value: values.totalTimeMinutes, label: t('recipes.totalTime'), accessibilityLabel: t('recipes.totalTimeMinutes') },
      { field: 'kcal', value: values.kcal, label: t('recipes.colKcal'), accessibilityLabel: t('recipes.kcalPerServing') },
      { field: 'protein', value: values.protein, label: t('recipes.protein'), accessibilityLabel: t('recipes.proteinPerServing') },
      { field: 'fat', value: values.fat, label: t('recipes.fat'), accessibilityLabel: t('recipes.fatPerServing') },
      { field: 'carbs', value: values.carbs, label: t('recipes.carbs'), accessibilityLabel: t('recipes.carbsPerServing') },
    ] as const,
    [values, t],
  )

  return (
    <View style={styles.editStatsCard}>
      {cells.map((cell, index) => (
        <StatCell key={cell.field} {...cell} divider={index > 0} onChange={onChange} />
      ))}
    </View>
  )
}

export default memo(EditStatsGrid)
