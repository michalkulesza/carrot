import { memo, useCallback, useMemo, useState } from 'react'
import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { RecipeOut } from '@carrot/shared/types'
import { AppText, SectionHeader } from '../../components/ui'
import { capitalizeFirst, getReadingMetrics, getVariantSteps } from './helpers'
import StepRow from './StepRow'
import { styles } from './styles'

interface StepsSectionProps {
  recipe: RecipeOut
  unitSystem: string
  fontSizeIndex: number
}

const SECTION_TOP_GAP = 36

const StepsSection = ({ recipe, unitSystem, fontSizeIndex }: StepsSectionProps) => {
  const { t } = useTranslation()
  const [doneKeys, setDoneKeys] = useState<Set<string>>(() => new Set())

  const metrics = useMemo(() => getReadingMetrics(fontSizeIndex), [fontSizeIndex])
  const groups = useMemo(
    () =>
      recipe.components
        .map((component, componentIndex) => ({
          componentIndex,
          name: component.name,
          steps: getVariantSteps(component, unitSystem),
        }))
        .filter((group) => group.steps.length > 0),
    [recipe.components, unitSystem],
  )

  const handleToggleDone = useCallback((key: string) => {
    setDoneKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)

      return next
    })
  }, [])

  if (groups.length === 0) return null

  const showGroupNames = recipe.components.length > 1

  return (
    <>
      <SectionHeader title={t('recipes.steps')} topGap={SECTION_TOP_GAP} />
      <View style={styles.stepsList}>
        {groups.map((group) => (
          <View key={group.componentIndex}>
            {showGroupNames && group.name ? (
              <AppText variant="caption" tone="textTertiary" style={styles.stepsGroupName}>
                {capitalizeFirst(group.name)}
              </AppText>
            ) : null}
            {group.steps.map((step, stepIndex) => {
              const key = `${group.componentIndex}-${stepIndex}`

              return (
                <StepRow
                  key={key}
                  rowKey={key}
                  step={step}
                  number={stepIndex + 1}
                  recipeId={recipe.id}
                  recipeTitle={recipe.title}
                  componentIndex={group.componentIndex}
                  stepIndex={stepIndex}
                  isLast={stepIndex === group.steps.length - 1}
                  done={doneKeys.has(key)}
                  onToggleDone={handleToggleDone}
                  metrics={metrics}
                />
              )
            })}
          </View>
        ))}
      </View>
    </>
  )
}

export default memo(StepsSection)
