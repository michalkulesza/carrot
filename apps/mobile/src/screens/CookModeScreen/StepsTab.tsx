import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import type { RecipeOut } from '@carrot/shared/types'
import { getUniqueDurations, scaleTextStyle, type CookStep } from './helpers'
import { styles } from './styles'
import StepProgress from './StepProgress'
import TimerChip from './TimerChip'

const OUT_MS = 110
const IN_MS = 110
const SLIDE_OFFSET = 32

interface StepsTabProps {
  recipe: Pick<RecipeOut, 'id' | 'title'>
  steps: CookStep[]
  index: number
  fontScale: number
}

const StepsTab = ({ recipe, steps, index, fontScale }: StepsTabProps) => {
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()
  const scrollRef = useRef<ScrollView>(null)
  const [shownIndex, setShownIndex] = useState(index)
  const [direction, setDirection] = useState<1 | -1>(1)
  const translateX = useSharedValue(0)
  const opacity = useSharedValue(1)
  const step = steps[shownIndex]
  const slideOffset = reduceMotion ? 0 : SLIDE_OFFSET

  const showStep = useCallback((nextIndex: number, nextDirection: 1 | -1) => {
    setDirection(nextDirection)
    setShownIndex(nextIndex)
  }, [])

  useEffect(() => {
    if (index === shownIndex) return

    const nextDirection = index > shownIndex ? 1 : -1
    const duration = reduceMotion ? 0 : OUT_MS

    translateX.value = withTiming(-nextDirection * slideOffset, { duration })
    opacity.value = withTiming(0, { duration }, (finished) => {
      if (finished) runOnJS(showStep)(index, nextDirection)
    })
  }, [index, shownIndex, opacity, reduceMotion, showStep, slideOffset, translateX])

  const settledIndexRef = useRef(shownIndex)

  useEffect(() => {
    if (settledIndexRef.current === shownIndex) return

    settledIndexRef.current = shownIndex
    scrollRef.current?.scrollTo({ y: 0, animated: false })

    const duration = reduceMotion ? 0 : IN_MS
    translateX.value = withSequence(withTiming(direction * slideOffset, { duration: 0 }), withTiming(0, { duration }))
    opacity.value = withTiming(1, { duration })
  }, [shownIndex, direction, opacity, reduceMotion, slideOffset, translateX])

  const contentStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }))

  const durations = useMemo(() => (step ? getUniqueDurations(step.text) : []), [step])
  const bodyStyle = useMemo(() => [styles.stepBody, scaleTextStyle(styles.stepBody, fontScale)], [fontScale])
  const containerStyle = useMemo(() => [styles.stepScroll, contentStyle], [contentStyle])

  if (!step) return null

  return (
    <>
      <StepProgress total={steps.length} index={index} />
      <Animated.View style={containerStyle}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.stepContent} showsVerticalScrollIndicator={false}>
          {step.componentName ? <Text style={styles.kicker}>{step.componentName}</Text> : null}
          <Text style={styles.stepTitle}>{t('cookMode.stepTitle', { number: shownIndex + 1 })}</Text>
          <Text style={bodyStyle}>{step.text}</Text>
          {durations.length > 0 ? (
            <View style={styles.timers}>
              {durations.map((duration, durationIndex) => (
                <TimerChip
                  key={duration.seconds}
                  recipe={recipe}
                  step={step}
                  duration={duration}
                  durationIndex={durationIndex}
                />
              ))}
            </View>
          ) : null}
        </ScrollView>
      </Animated.View>
    </>
  )
}

export default memo(StepsTab)
