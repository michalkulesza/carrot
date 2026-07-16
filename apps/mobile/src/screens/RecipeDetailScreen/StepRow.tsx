import { useMemo } from 'react'
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { RecipeOut, StepIngredientRef } from '@carrot/shared/types'
import { displayIngredient } from '@carrot/shared/utils/ingredientUtils'
import { parseDurationMatch } from '../../context/TimerContext'
import { styles } from './styles'
import StepText from './StepText'

const StepRow = ({
  step,
  index,
  recipe,
  componentIndex,
  stepRefs,
  rawIngredients,
  showStepQty = true,
  fontSize = 17,
  lineHeight = 22,
}: {
  step: string
  index: number
  recipe: RecipeOut
  componentIndex: number
  stepRefs: StepIngredientRef[]
  rawIngredients: string[]
  showStepQty?: boolean
  fontSize?: number
  lineHeight?: number
}) => {
  const { t } = useTranslation()
  const durationMatch = useMemo(() => parseDurationMatch(step), [step])
  const timerId = `${recipe.id}-c${componentIndex}-s${index}`

  const stepIngredients = useMemo(() => {
    const seen = new Set<number>()
    return stepRefs.filter((ref) => {
      if (seen.has(ref.ingredient_index)) return false
      seen.add(ref.ingredient_index)
      return true
    })
  }, [stepRefs])

  return (
    <View style={styles.stepRow}>
      <Text style={styles.stepNum}>{index + 1}.</Text>
      <View style={styles.stepBody}>
        <StepText
          step={step}
          stepRefs={stepRefs}
          durationMatch={durationMatch}
          timerProps={
            durationMatch
              ? { timerId, recipe, componentIndex, stepIndex: index, stepText: step }
              : undefined
          }
          fontSize={fontSize}
          lineHeight={lineHeight}
        />
        {showStepQty && stepIngredients.length > 0 && (
          <View style={styles.stepIngList}>
            {stepIngredients.map((ref) => (
              <View key={ref.ingredient_index} style={styles.stepIngRow}>
                <View style={styles.stepIngDot} />
                <Text style={styles.stepIngItem}>
                  {displayIngredient(rawIngredients[ref.ingredient_index] ?? '')}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  )
}

export default StepRow
