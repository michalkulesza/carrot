import { parseDurationMatch } from '../../context/TimerContext'
import StepTimerChip from './StepTimerChip'

interface StepTextProps {
  step: string
  timerId: string
  recipeId: string
  recipeTitle: string
  componentIndex: number
  stepIndex: number
}

const StepText = ({
  step,
  timerId,
  recipeId,
  recipeTitle,
  componentIndex,
  stepIndex,
}: StepTextProps) => {
  const timerMatch = parseDurationMatch(step)

  const nodes: React.ReactNode[] = timerMatch
    ? [
        step.slice(0, timerMatch.start),
        <StepTimerChip
          key={`t${timerMatch.start}`}
          timerId={timerId}
          totalSeconds={timerMatch.seconds}
          stepText={step}
          recipeId={recipeId}
          recipeTitle={recipeTitle}
          componentIndex={componentIndex}
          stepIndex={stepIndex}
        />,
        step.slice(timerMatch.end),
      ]
    : [step]

  return <span className="flex-1 text-zinc-900">{nodes}</span>
}

export default StepText
