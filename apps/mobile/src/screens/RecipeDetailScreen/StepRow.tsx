import { useMemo } from 'react'
import { Text, View } from 'react-native'
import type { RecipeOut } from '@carrot/shared/types'
import { parseDurationMatch } from '../../context/TimerContext'
import { styles } from './styles'
import StepText from './StepText'

const StepRow = ({
  step,
  index,
  recipe,
  componentIndex,
  fontSize = 17,
  lineHeight = 22,
}: {
  step: string
  index: number
  recipe: RecipeOut
  componentIndex: number
  fontSize?: number
  lineHeight?: number
}) => {
  const durationMatch = useMemo(() => parseDurationMatch(step), [step])
  const timerId = `${recipe.id}-c${componentIndex}-s${index}`

  return (
    <View style={styles.stepRow}>
      <Text style={styles.stepNum}>{index + 1}.</Text>
      <View style={styles.stepBody}>
        <StepText
          step={step}
          durationMatch={durationMatch}
          timerProps={
            durationMatch
              ? { timerId, recipe, componentIndex, stepIndex: index, stepText: step }
              : undefined
          }
          fontSize={fontSize}
          lineHeight={lineHeight}
        />
      </View>
    </View>
  )
}

export default StepRow
