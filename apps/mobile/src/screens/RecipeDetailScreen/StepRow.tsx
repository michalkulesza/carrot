import { memo, useCallback, useMemo } from 'react'
import { Pressable, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { SymbolView } from 'expo-symbols'
import { useTranslation } from 'react-i18next'
import { parseDurationMatch } from '../../context/TimerContext'
import { palette, useMotion, usePressScale } from '../../theme'
import { lightHaptic } from '../../components/ui/haptics'
import type { ReadingMetrics } from './helpers'
import { styles } from './styles'
import TimerChip from './TimerChip'

interface StepRowProps {
  rowKey: string
  step: string
  number: number
  recipeId: string
  recipeTitle: string
  componentIndex: number
  stepIndex: number
  isLast: boolean
  done: boolean
  onToggleDone: (key: string) => void
  metrics: ReadingMetrics
  animateLayout: boolean
}

const CHECK_SIZE = 17

const StepRow = ({
  rowKey,
  step,
  number,
  recipeId,
  recipeTitle,
  componentIndex,
  stepIndex,
  isLast,
  done,
  onToggleDone,
  metrics,
  animateLayout,
}: StepRowProps) => {
  const { t } = useTranslation()
  const { fade, exiting, layout } = useMotion()
  const { animatedStyle, onPressIn, onPressOut } = usePressScale()

  const durationMatch = useMemo(() => parseDurationMatch(step), [step])
  const timerId = `${recipeId}-c${componentIndex}-s${stepIndex}`

  const handleToggle = useCallback(() => {
    lightHaptic()
    onToggleDone(rowKey)
  }, [onToggleDone, rowKey])

  const circleStyle = useMemo(
    () => [styles.stepCircle, { backgroundColor: done ? palette.successCheck : palette.ink }, animatedStyle],
    [done, animatedStyle],
  )
  const textStyle = useMemo(
    () => [
      styles.stepText,
      { fontSize: metrics.fontSize, lineHeight: metrics.stepLineHeight },
      done && styles.stepTextDone,
    ],
    [metrics.fontSize, metrics.stepLineHeight, done],
  )
  const bodyStyle = useMemo(() => [styles.stepBody, !isLast && styles.stepBodySpaced], [isLast])
  const rowLayout = animateLayout ? layout : undefined

  return (
    <Animated.View layout={rowLayout} style={styles.stepRow}>
      <View style={styles.stepTimeline}>
        <Pressable
          onPress={handleToggle}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          hitSlop={5}
          accessibilityRole="checkbox"
          accessibilityLabel={t('recipes.stepLabel', { n: number })}
          accessibilityState={{ checked: done }}
        >
          <Animated.View style={circleStyle}>
            <Animated.View key={done ? 'done' : 'open'} entering={fade} exiting={exiting} style={styles.stepCircleGlyph}>
              {done ? (
                <SymbolView name="checkmark" size={CHECK_SIZE} weight="bold" tintColor={palette.onImage} />
              ) : (
                <Text style={styles.stepNumber}>{number}</Text>
              )}
            </Animated.View>
          </Animated.View>
        </Pressable>
        {!isLast ? <View style={styles.stepLine} /> : null}
      </View>
      <View style={bodyStyle}>
        <Text style={textStyle} numberOfLines={done ? 1 : undefined}>
          {step}
        </Text>
        {durationMatch && !done ? (
          <Animated.View entering={fade} exiting={exiting} style={styles.timerRow}>
            <TimerChip
              timerId={timerId}
              recipeId={recipeId}
              recipeTitle={recipeTitle}
              componentIndex={componentIndex}
              stepIndex={stepIndex}
              stepText={step}
              seconds={durationMatch.seconds}
            />
          </Animated.View>
        ) : null}
      </View>
    </Animated.View>
  )
}

export default memo(StepRow)
