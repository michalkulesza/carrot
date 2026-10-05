import { useTranslation } from 'react-i18next'
import type { SaveComponent } from '@carrot/shared/types'
import { parseDurationMatch } from '../../context/TimerContext'
import { INTERNAL_COMPONENT_NAMES } from './helpers'
import StepTimerChip from './StepTimerChip'

interface RecipeStepListProps {
  components: SaveComponent[]
  unitSystem: string
  recipeId: string
  recipeTitle: string
  doneSteps: Set<string>
  onToggleStep: (key: string) => void
  desktop: boolean
}

const getSteps = (component: SaveComponent, unitSystem: string) =>
  unitSystem === 'imperial'
    ? (component.imperial_steps ?? component.steps)
    : (component.metric_steps ?? component.steps)

const RecipeStepList = ({
  components,
  unitSystem,
  recipeId,
  recipeTitle,
  doneSteps,
  onToggleStep,
  desktop,
}: RecipeStepListProps) => {
  const { t } = useTranslation()
  const groups = components.map((component, componentIndex) => ({
    componentIndex,
    name: INTERNAL_COMPONENT_NAMES.has(component.name) ? '' : component.name,
    steps: getSteps(component, unitSystem),
  }))
  const total = groups.reduce((sum, group) => sum + group.steps.length, 0)
  if (total === 0) return null
  const done = groups.reduce(
    (sum, group) =>
      sum +
      group.steps.filter((_, i) =>
        doneSteps.has(`${group.componentIndex}-${i}`)
      ).length,
    0
  )

  return (
    <section className={`flex flex-col ${desktop ? 'gap-3' : 'gap-2.5'}`}>
      <div
        className={`flex flex-col gap-2 ${desktop ? 'px-0.5 pb-1 pt-3' : 'pt-1.5'}`}
      >
        <div className="flex items-baseline gap-2">
          <h3 className={`font-extrabold ${desktop ? 'text-lg' : 'text-xl'}`}>
            {t('recipes.method')}
          </h3>
          <span className="text-sm font-semibold text-[#8C8A99]">
            {t('recipes.stepsDone', { done, total })}
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          className="h-1.5 overflow-hidden rounded-full bg-[#F1EFF5]"
        >
          <div
            className="h-full rounded-full bg-[#E8894A] transition-[width] duration-300"
            style={{ width: `${(done / total) * 100}%` }}
          />
        </div>
      </div>
      {groups.map((group) => (
        <div
          key={group.componentIndex}
          className={`flex flex-col ${desktop ? 'gap-3' : 'gap-2.5'}`}
        >
          {group.name && groups.length > 1 && group.steps.length > 0 && (
            <h4 className="text-sm font-bold text-[#6B6A78]">{group.name}</h4>
          )}
          {group.steps.map((step, i) => {
            const key = `${group.componentIndex}-${i}`
            const isDone = doneSteps.has(key)
            const timer = parseDurationMatch(step)

            return (
              <div
                key={key}
                id={`timer-step-${group.componentIndex}-${i}`}
                role="button"
                tabIndex={0}
                aria-pressed={isDone}
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest('button')) return
                  onToggleStep(key)
                }}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onToggleStep(key)
                  }
                }}
                className={`flex rounded-[14px] border transition-colors duration-300 ${
                  desktop ? 'gap-4 px-[18px] py-4' : 'gap-3 p-3.5'
                } ${
                  isDone
                    ? 'border-[#F1EFF5] bg-[#FBFAFC] opacity-60'
                    : 'border-[#ECEAF0] bg-white'
                }`}
              >
                <div
                  className={`flex shrink-0 items-center justify-center rounded-full font-extrabold ${
                    desktop
                      ? 'h-[30px] w-[30px] text-sm'
                      : 'h-7 w-7 text-[13px]'
                  } ${isDone ? 'bg-[#E8894A] text-white' : 'bg-[#F1EFF5] text-[#4A4858]'}`}
                >
                  {isDone ? '✓' : i + 1}
                </div>
                <div className="flex flex-1 flex-col gap-2.5">
                  <span
                    className={`text-base [text-wrap:pretty] ${
                      desktop ? 'leading-[1.55]' : 'leading-[1.5]'
                    } ${isDone ? 'line-through' : ''}`}
                  >
                    {step}
                  </span>
                  {timer && (
                    <div className="flex flex-wrap gap-1.5">
                      <StepTimerChip
                        popup
                        timerId={`${recipeId}-c${group.componentIndex}-s${i}`}
                        totalSeconds={timer.seconds}
                        stepText={step}
                        recipeId={recipeId}
                        recipeTitle={recipeTitle}
                        componentIndex={group.componentIndex}
                        stepIndex={i}
                      />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </section>
  )
}

export default RecipeStepList
