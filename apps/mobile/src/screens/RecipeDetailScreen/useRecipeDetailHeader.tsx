import { useLayoutEffect, useMemo } from 'react'
import { PlatformColor, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Feather, Ionicons } from '@expo/vector-icons'
import { MenuView, type MenuAction } from '@react-native-menu/menu'
import type { NavigationProp, NavigationState } from '@react-navigation/native'
import type { HouseholdOut } from '@carrot/shared/types'
import BugReportButton from '../../components/BugReportButton'
import { colors } from '../../theme/colors'
import { styles } from './styles'

export const SEND_TO_HOUSEHOLD_PREFIX = 'send-to-household-'
export const SEND_TO_PERSONAL = 'send-to-personal'

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
  recipe,
  activeHouseholdId,
  onToggleAddMode,
  onOpenMealPlanSheet,
  households,
  onPressRecipeAction,
  onEdit,
}: {
  addMode: boolean
  recipe: { household_id: string | null; shared_to_personal: boolean }
  activeHouseholdId: string | null
  onToggleAddMode: () => void
  onOpenMealPlanSheet: () => void
  households: HouseholdOut[]
  onPressRecipeAction: ({ nativeEvent }: { nativeEvent: { event: string } }) => void
  onEdit: () => void
}) => {
  const { t } = useTranslation()
  const recipeActions = useMemo<MenuAction[]>(
    () => {
      if (recipe.household_id === activeHouseholdId && !recipe.shared_to_personal) {
        return [{ id: SEND_TO_PERSONAL, title: t('recipes.sendToPersonalLibrary') }]
      }
      if (recipe.household_id !== null) return []
      return [
        households.length > 0
          ? {
              id: 'send-to-household',
              title: t('recipes.sendToHousehold'),
              subactions: households.map((h) => ({ id: `${SEND_TO_HOUSEHOLD_PREFIX}${h.id}`, title: h.name })),
            }
          : { id: 'send-to-household', title: t('recipes.sendToHousehold'), attributes: { disabled: true } },
      ]
    },
    [activeHouseholdId, households, recipe.household_id, recipe.shared_to_personal, t],
  )
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
      {recipeActions.length > 0 && (
        <MenuView title={t('recipes.recipeActions')} actions={recipeActions} onPressAction={onPressRecipeAction}>
          <Pressable
            style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}
            accessibilityLabel={t('recipes.recipeActions')}
            accessibilityRole="button"
            hitSlop={8}
          >
            <Feather name="share" size={20} color={colors.secondaryLabel} />
          </Pressable>
        </MenuView>
      )}
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
  recipe,
  activeHouseholdId,
  onToggleAddMode,
  handleEdit,
  handleCancelEdit,
  handleOpenMealPlanSheet,
  households,
  handlePressRecipeAction,
}: {
  navigation: RecipeDetailNavigation
  editing: boolean
  addMode: boolean
  recipe: { household_id: string | null; shared_to_personal: boolean }
  activeHouseholdId: string | null
  onToggleAddMode: () => void
  handleEdit: () => void
  handleCancelEdit: () => void
  handleOpenMealPlanSheet: () => void
  households: HouseholdOut[]
  handlePressRecipeAction: ({ nativeEvent }: { nativeEvent: { event: string } }) => void
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
            recipe={recipe}
            activeHouseholdId={activeHouseholdId}
            onToggleAddMode={onToggleAddMode}
            onOpenMealPlanSheet={handleOpenMealPlanSheet}
            households={households}
            onPressRecipeAction={handlePressRecipeAction}
            onEdit={handleEdit}
          />
        ),
      })
    }
  }, [
    navigation,
    editing,
    handleEdit,
    handleCancelEdit,
    handleOpenMealPlanSheet,
    households,
    handlePressRecipeAction,
    addMode,
    recipe,
    activeHouseholdId,
    onToggleAddMode,
  ])
}
