import { memo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import EditSheet from './EditSheet'
import EditSheetInput from './EditSheetInput'
import { styles } from './styles'

interface StepEditSheetProps {
  visible: boolean
  step: string | null
  canRemove: boolean
  onChange: (value: string) => void
  onRemove: () => void
  onDismiss: () => void
}

const StepEditSheet = ({ visible, step, canRemove, onChange, onRemove, onDismiss }: StepEditSheetProps) => {
  const { t } = useTranslation()

  const lastStepRef = useRef('')
  if (step !== null) lastStepRef.current = step

  return (
    <EditSheet
      visible={visible}
      title={t('recipes.editStep')}
      removeLabel={t('addRecipe.removeStep')}
      canRemove={canRemove}
      onRemove={onRemove}
      onDismiss={onDismiss}
    >
      <EditSheetInput
        style={styles.editSheetStepInput}
        value={step ?? lastStepRef.current}
        onChangeText={onChange}
        placeholder={t('recipes.stepPlaceholder')}
        multiline
        autoFocus
        autoCapitalize="sentences"
        autoCorrect
        keyboardType="default"
        returnKeyType="default"
        accessibilityLabel={t('recipes.editStep')}
      />
    </EditSheet>
  )
}

export default memo(StepEditSheet)
