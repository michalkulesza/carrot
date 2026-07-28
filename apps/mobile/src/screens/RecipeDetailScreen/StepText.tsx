import { useMemo } from 'react'
import { Text } from 'react-native'
import type { DurationMatch } from '../../context/TimerContext'
import { buildSegments } from './helpers'
import { styles } from './styles'
import TimerSpan from './TimerSpan'

const StepText = ({
  step,
  durationMatch,
  timerProps,
  fontSize = 17,
  lineHeight = 22,
}: {
  step: string
  durationMatch?: DurationMatch | null
  timerProps?: Omit<React.ComponentProps<typeof TimerSpan>, 'seconds'>
  fontSize?: number
  lineHeight?: number
}) => {
  const segments = useMemo(
    () => buildSegments(step, durationMatch ?? null),
    [step, durationMatch],
  )

  return (
    <Text style={[styles.stepText, { fontSize, lineHeight }]}>
      {segments.map((seg, i) => {
        if (seg.type === 'text') return <Text key={i}>{seg.text}</Text>
        if (seg.type === 'timer' && timerProps) {
          return <TimerSpan key={i} {...timerProps} seconds={seg.seconds} />
        }
        return null
      })}
    </Text>
  )
}

export default StepText
