import { memo } from 'react'
import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui'
import { styles } from './styles'

interface DeleteRecipeButtonProps {
  disabled: boolean
  onPress: () => void
}

const DeleteRecipeButton = ({ disabled, onPress }: DeleteRecipeButtonProps) => {
  const { t } = useTranslation()

  return (
    <View style={styles.deleteRecipeWrapper}>
      <Button label={t('recipes.deleteRecipe')} icon="trash" variant="danger" size="xl" fullWidth disabled={disabled} onPress={onPress} />
    </View>
  )
}

export default memo(DeleteRecipeButton)
