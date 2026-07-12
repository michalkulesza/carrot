import { useLayoutEffect } from 'react'
import { PlatformColor, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Feather, Ionicons } from '@expo/vector-icons'
import type { NavigationProp, NavigationState } from '@react-navigation/native'
import BugReportButton from '../../components/BugReportButton'
import { colors } from '../../theme/colors'
import { styles } from './styles'

type RecipeDetailNavigation = Omit<NavigationProp<ReactNavigation.RootParamList>, 'getState'> & {
  getState(): NavigationState | undefined
}

const EditHeaderLeft = ({ onCancel }: { onCancel: () => void }) => {
  const { t } = useTranslation()
  return (
    <Pressable
      onPress={onCancel}
      hitSlop={8}
      style={({ pressed }) => [styles.headerBackBtn, pressed && { opacity: 0.5 }]}
      accessibilityLabel={t('common.back')}
    >
      <Ionicons name="chevron-back" size={28} color={PlatformColor('label') as unknown as string} />
      <Text style={styles.headerBackText}>{t('common.back')}</Text>
    </Pressable>
  )
}

const EditHeaderRight = () => (
  <View style={styles.headerBtns}>
    <BugReportButton />
  </View>
)

const ViewHeaderRight = ({
  addMode,
  onToggleAddMode,
  onOpenMealPlanSheet,
  onEdit,
}: {
  addMode: boolean
  onToggleAddMode: () => void
  onOpenMealPlanSheet: () => void
  onEdit: () => void
}) => {
  const { t } = useTranslation()
  return (
    <View style={styles.headerBtns}>
      <Pressable
        onPress={onToggleAddMode}
        style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}
        accessibilityLabel={t('shoppingList.addToList')}
        accessibilityRole="button"
      >
        <Feather name="shopping-cart" size={20} color={addMode ? colors.blue : colors.secondaryLabel} />
      </Pressable>
      <Pressable
        onPress={onOpenMealPlanSheet}
        style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}
        accessibilityLabel={t('mealPlan.addToMealPlan')}
        accessibilityRole="button"
        hitSlop={8}
      >
        <Feather name="calendar" size={20} color={colors.secondaryLabel} />
      </Pressable>
      <Pressable
        onPress={onEdit}
        style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}
        accessibilityLabel={t('common.edit')}
        accessibilityRole="button"
      >
        <Feather name="edit-2" size={22} color={colors.secondaryLabel} />
      </Pressable>
      <BugReportButton />
    </View>
  )
}

export const useRecipeDetailHeader = ({
  navigation,
  editing,
  addMode,
  onToggleAddMode,
  handleEdit,
  handleCancelEdit,
  handleOpenMealPlanSheet,
}: {
  navigation: RecipeDetailNavigation
  editing: boolean
  addMode: boolean
  onToggleAddMode: () => void
  handleEdit: () => void
  handleCancelEdit: () => void
  handleOpenMealPlanSheet: () => void
}) => {
  useLayoutEffect(() => {
    if (editing) {
      navigation.setOptions({
        gestureEnabled: false,
        headerTransparent: true,
        headerTitle: '',
        headerShadowVisible: false,
        headerLeft: () => <EditHeaderLeft onCancel={handleCancelEdit} />,
        headerRight: () => <EditHeaderRight />,
      })
    } else {
      navigation.setOptions({
        gestureEnabled: true,
        headerTransparent: true,
        headerTitle: '',
        headerShadowVisible: false,
        headerLeft: undefined,
        headerRight: () => (
          <ViewHeaderRight
            addMode={addMode}
            onToggleAddMode={onToggleAddMode}
            onOpenMealPlanSheet={handleOpenMealPlanSheet}
            onEdit={handleEdit}
          />
        ),
      })
    }
  }, [navigation, editing, handleEdit, handleCancelEdit, handleOpenMealPlanSheet, addMode, onToggleAddMode])
}
