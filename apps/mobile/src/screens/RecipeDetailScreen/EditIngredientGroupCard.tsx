import { memo, useCallback } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { AppText, Card } from '../../components/ui'
import { lightHaptic } from '../../components/ui/haptics'
import EditIngredientRow from './EditIngredientRow'
import EditTextInput from './EditTextInput'
import type { EditComponent } from './helpers'
import { styles } from './styles'

interface EditIngredientGroupCardProps {
  comp: EditComponent
  ci: number
  multiComponent: boolean
  onNameChange: (ci: number, name: string) => void
  onOpenIngredient: (ci: number, ii: number) => void
  onAddIngredient: (ci: number) => void
}

interface GroupTitleProps {
  ci: number
  name: string
  editable: boolean
  onNameChange: (ci: number, name: string) => void
}

const GroupTitle = ({ ci, name, editable, onNameChange }: GroupTitleProps) => {
  const { t } = useTranslation()

  const handleNameChange = useCallback((value: string) => onNameChange(ci, value), [onNameChange, ci])

  if (!editable) {
    return (
      <AppText variant="groupTitle" style={styles.groupTitle} numberOfLines={2}>
        {t('recipes.sectionIngredients')}
      </AppText>
    )
  }

  return (
    <EditTextInput
      style={styles.editGroupNameInput}
      value={name}
      onChangeText={handleNameChange}
      autoCapitalize="sentences"
      autoCorrect
      keyboardType="default"
      returnKeyType="done"
      accessibilityLabel={t('settings.nameLabel')}
    />
  )
}

const EditIngredientGroupCard = ({
  comp,
  ci,
  multiComponent,
  onNameChange,
  onOpenIngredient,
  onAddIngredient,
}: EditIngredientGroupCardProps) => {
  const { t } = useTranslation()

  const lastIndex = comp.ingredients.length - 1
  const countLabel = t('recipes.ingredientsCount', { count: comp.ingredients.length })

  const handleAdd = useCallback(() => {
    lightHaptic()
    onAddIngredient(ci)
  }, [onAddIngredient, ci])

  return (
    <Card style={styles.groupCard}>
      <View style={styles.groupHeader}>
        <GroupTitle ci={ci} name={comp.name} editable={multiComponent} onNameChange={onNameChange} />
        <AppText variant="meta" tone="textTertiary">
          {countLabel}
        </AppText>
      </View>
      <View style={styles.groupBody}>
        {comp.ingredients.map((ingredient, ii) => (
          <EditIngredientRow
            key={ii}
            ci={ci}
            ii={ii}
            ingredient={ingredient}
            isLast={ii === lastIndex}
            onPress={onOpenIngredient}
          />
        ))}
      </View>
      <Pressable
        onPress={handleAdd}
        hitSlop={8}
        style={styles.editAddRow}
        accessibilityRole="button"
        accessibilityLabel={t('addRecipe.addIngredient')}
      >
        <Text style={styles.editAddRowText}>+ {t('addRecipe.addIngredient')}</Text>
      </Pressable>
    </Card>
  )
}

export default memo(EditIngredientGroupCard)
