import { useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import { PlatformColor, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Feather, Ionicons } from '@expo/vector-icons'
import { MenuView, type MenuAction } from '@react-native-menu/menu'
import type { NavigationProp, NavigationState } from '@react-navigation/native'
import type { HouseholdOut } from '@carrot/shared/types'
import BugReportButton from '../../components/BugReportButton'
import { colors } from '../../theme/colors'
import { styles } from './styles'

export const TOGGLE_HOUSEHOLD_PREFIX = 'toggle-household-'
export const SHARE_PUBLICLY = 'share-publicly'

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
  onToggleAddMode,
  onOpenMealPlanSheet,
  households,
  onPressRecipeAction,
  onSharePublicly,
  onEdit,
}: {
  addMode: boolean
  recipe: { household_ids: string[] }
  onToggleAddMode: () => void
  onOpenMealPlanSheet: () => void
  households: HouseholdOut[]
  onPressRecipeAction: ({ nativeEvent }: { nativeEvent: { event: string } }) => void
  onSharePublicly: () => void
  onEdit: () => void
}) => {
  const { t } = useTranslation()
  const publicShareSelectedRef = useRef(false)
  const recipeActions = useMemo<MenuAction[]>(
    () => {
      const publicAction: MenuAction = { id: SHARE_PUBLICLY, title: t('publicShare.sharePublicly') }
      if (households.length === 0) return [publicAction]
      return [
        publicAction,
        {
          id: 'in-households',
          title: t('recipes.inHouseholds'),
          subactions: households.map((h) => ({
            id: `${TOGGLE_HOUSEHOLD_PREFIX}${h.id}`,
            title: h.name,
            state: recipe.household_ids.includes(h.id) ? 'on' : 'off',
          })),
        },
      ]
    },
    [households, recipe.household_ids, t],
  )
  const handleMenuAction = useCallback(({ nativeEvent }: { nativeEvent: { event: string } }) => {
    if (nativeEvent.event === SHARE_PUBLICLY) {
      publicShareSelectedRef.current = true
      return
    }
    onPressRecipeAction({ nativeEvent })
  }, [onPressRecipeAction])

  const handleMenuClose = useCallback(() => {
    if (!publicShareSelectedRef.current) return
    publicShareSelectedRef.current = false
    setTimeout(onSharePublicly, 0)
  }, [onSharePublicly])

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
        <MenuView
          title={t('recipes.recipeActions')}
          actions={recipeActions}
          onPressAction={handleMenuAction}
          onCloseMenu={handleMenuClose}
        >
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
  cooking,
  addMode,
  recipe,
  onToggleAddMode,
  handleEdit,
  handleCancelEdit,
  handleOpenMealPlanSheet,
  households,
  handlePressRecipeAction,
  handleSharePublicly,
}: {
  navigation: RecipeDetailNavigation
  editing: boolean
  cooking: boolean
  addMode: boolean
  recipe: { household_ids: string[] }
  onToggleAddMode: () => void
  handleEdit: () => void
  handleCancelEdit: () => void
  handleOpenMealPlanSheet: () => void
  households: HouseholdOut[]
  handlePressRecipeAction: ({ nativeEvent }: { nativeEvent: { event: string } }) => void
  handleSharePublicly: () => void
}) => {
  useLayoutEffect(() => {
    if (cooking) return
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
            onToggleAddMode={onToggleAddMode}
            onOpenMealPlanSheet={handleOpenMealPlanSheet}
            households={households}
            onPressRecipeAction={handlePressRecipeAction}
            onSharePublicly={handleSharePublicly}
            onEdit={handleEdit}
          />
        ),
      })
    }
  }, [
    navigation,
    editing,
    cooking,
    handleEdit,
    handleCancelEdit,
    handleOpenMealPlanSheet,
    households,
    handlePressRecipeAction,
    addMode,
    recipe,
    onToggleAddMode,
  ])
}
