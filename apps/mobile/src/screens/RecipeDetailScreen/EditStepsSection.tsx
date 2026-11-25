import { memo, useCallback, useMemo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { AppText, SectionHeader } from '../../components/ui'
import { lightHaptic } from '../../components/ui/haptics'
import EditStepRow from './EditStepRow'
import { capitalizeFirst, type EditComponent } from './helpers'
import { styles } from './styles'

interface EditStepsSectionProps {
  components: EditComponent[]
  onOpenStep: (ci: number, si: number) => void
  onAddStep: (ci: number) => void
}

const SECTION_TOP_GAP = 36

interface AddStepRowProps {
  ci: number
  onAddStep: (ci: number) => void
}

const AddStepRow = ({ ci, onAddStep }: AddStepRowProps) => {
  const { t } = useTranslation()

  const handlePress = useCallback(() => {
    lightHaptic()
    onAddStep(ci)
  }, [onAddStep, ci])

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={8}
      style={styles.addStepRow}
      accessibilityRole="button"
      accessibilityLabel={t('addRecipe.addStep')}
    >
      <View style={styles.addStepCircle}>
        <Text style={styles.addStepPlus}>+</Text>
      </View>
      <Text style={styles.addStepText}>{t('addRecipe.addStep')}</Text>
    </Pressable>
  )
}

const EditStepsSection = ({ components, onOpenStep, onAddStep }: EditStepsSectionProps) => {
  const { t } = useTranslation()

  const groups = useMemo(
    () => components.map((comp, ci) => ({ comp, ci })).filter(({ comp }) => comp.steps.length > 0),
    [components],
  )
  const showGroupNames = groups.length > 1
  const addStepTarget = groups.at(-1)?.ci ?? 0

  return (
    <>
      <SectionHeader title={t('recipes.steps')} topGap={SECTION_TOP_GAP} />
      <View style={styles.stepsList}>
        {groups.map(({ comp, ci }) => (
          <View key={ci}>
            {showGroupNames && comp.name ? (
              <AppText variant="caption" tone="textTertiary" style={styles.stepsGroupName}>
                {capitalizeFirst(comp.name)}
              </AppText>
            ) : null}
            {comp.steps.map((step, si) => (
              <EditStepRow key={si} ci={ci} si={si} step={step} onPress={onOpenStep} />
            ))}
          </View>
        ))}
        <AddStepRow ci={addStepTarget} onAddStep={onAddStep} />
      </View>
    </>
  )
}

export default memo(EditStepsSection)
