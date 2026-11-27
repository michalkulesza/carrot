import { memo } from 'react'
import { View } from 'react-native'
import type { RecipeOut } from '@carrot/shared/types'
import { useTranslation } from 'react-i18next'
import Byline from './Byline'
import EditTextInput from './EditTextInput'
import { styles } from './styles'

interface EditTitleBlockProps {
  recipe?: RecipeOut
  title: string
  onTitleChange: (title: string) => void
  onDeleteRecipe?: () => void
}

const EditTitleBlock = ({ recipe, title, onTitleChange, onDeleteRecipe }: EditTitleBlockProps) => {
  const { t } = useTranslation()

  return (
    <View style={styles.editTitleColumn}>
      <EditTextInput
        style={styles.editTitleInput}
        value={title}
        onChangeText={onTitleChange}
        multiline
        scrollEnabled={false}
        autoCapitalize="sentences"
        autoCorrect
        keyboardType="default"
        returnKeyType="done"
        submitBehavior="blurAndSubmit"
        placeholder={t('recipes.recipeNamePlaceholder')}
        accessibilityLabel={t('recipes.colTitle')}
      />
      {recipe && onDeleteRecipe ? <Byline recipe={recipe} onDeleteRecipe={onDeleteRecipe} /> : null}
    </View>
  )
}

export default memo(EditTitleBlock)
