import type { StepIngredientRef } from '@carrot/shared/types'
import { parseDurationMatch } from '../../context/TimerContext'
import { displayIngredient } from './helpers'
import StepTimerChip from './StepTimerChip'
import IngredientPill from './IngredientPill'

interface StepTextProps {
  step: string
  stepRefs: StepIngredientRef[]
  ingredients: string[]
  timerId: string
  recipeId: string
  recipeTitle: string
  componentIndex: number
  stepIndex: number
}

interface Span {
  start: number
  end: number
  kind: 'timer' | 'ingredient'
  seconds?: number
  mention?: string
  ingredientIndex?: number
  key: string
}

const buildSpans = (step: string, stepRefs: StepIngredientRef[]): Span[] => {
  const spans: Span[] = []

  const timerMatch = parseDurationMatch(step)
  if (timerMatch) {
    spans.push({
      start: timerMatch.start,
      end: timerMatch.end,
      kind: 'timer',
      seconds: timerMatch.seconds,
      key: `t${timerMatch.start}`,
    })
  }

  for (const ref of stepRefs) {
    let idx = 0
    while (true) {
      const pos = step.indexOf(ref.mention, idx)
      if (pos === -1) break
      spans.push({
        start: pos,
        end: pos + ref.mention.length,
        kind: 'ingredient',
        mention: ref.mention,
        ingredientIndex: ref.ingredient_index,
        key: `i${pos}-${ref.ingredient_index}`,
      })
      idx = pos + ref.mention.length
    }
  }

  spans.sort((a, b) => a.start - b.start)

  const filtered: Span[] = []
  let cursor = 0
  for (const span of spans) {
    if (span.start >= cursor) {
      filtered.push(span)
      cursor = span.end
    }
  }

  return filtered
}

const StepText = ({
  step,
  stepRefs,
  ingredients,
  timerId,
  recipeId,
  recipeTitle,
  componentIndex,
  stepIndex,
}: StepTextProps) => {
  const filtered = buildSpans(step, stepRefs)

  const nodes: React.ReactNode[] = []
  let pos = 0
  for (const span of filtered) {
    if (pos < span.start) nodes.push(step.slice(pos, span.start))
    if (span.kind === 'timer') {
      nodes.push(
        <StepTimerChip
          key={span.key}
          timerId={timerId}
          totalSeconds={span.seconds!}
          stepText={step}
          recipeId={recipeId}
          recipeTitle={recipeTitle}
          componentIndex={componentIndex}
          stepIndex={stepIndex}
        />
      )
    } else {
      const ingText = displayIngredient(ingredients[span.ingredientIndex!] ?? '')
      nodes.push(
        <IngredientPill
          key={span.key}
          mention={span.mention!}
          ingredientText={ingText}
        />
      )
    }
    pos = span.end
  }
  if (pos < step.length) nodes.push(step.slice(pos))

  return <span className="flex-1">{nodes}</span>
}

export default StepText
