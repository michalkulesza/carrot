import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { MenuView, type MenuAction } from '@react-native-menu/menu'
import type { NavigationProp, NavigationState } from '@react-navigation/native'
import type { NativeStackHeaderItemButton } from '@react-navigation/native-stack'
import type { HouseholdOut } from '@carrot/shared/types'
import { colors } from '../../theme/colors'
import { palette } from '../../theme'
import { EditHeaderTitle } from './EditHeader'
import HeaderIconButton from './HeaderIconButton'
import { styles } from './styles'

export const TOGGLE_HOUSEHOLD_PREFIX = 'toggle-household-'
export const SHARE_PUBLICLY = 'share-publicly'

type RecipeDetailNavigation = Omit<NavigationProp<ReactNavigation.RootParamList>, 'getState'> & {
  getState(): NavigationState | undefined
}

const ViewHeaderRight = ({
  addMode,
  recipe,
  onToggleAddMode,
  onOpenMealPlanSheet,
  households,
  onPressRecipeAction,
  onSharePublicly,
  onEdit,
  editPending,
}: {
  addMode: boolean
  recipe: { household_ids: string[] }
  onToggleAddMode: () => void
  onOpenMealPlanSheet: () => void
  households: HouseholdOut[]
  onPressRecipeAction: ({ nativeEvent }: { nativeEvent: { event: string } }) => void
  onSharePublicly: () => void
  onEdit: () => void
  editPending: boolean
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

  const cartColor = addMode ? colors.blue : colors.secondaryLabel

  const handleMenuClose = useCallback(() => {
    if (!publicShareSelectedRef.current) return
    publicShareSelectedRef.current = false
    setTimeout(onSharePublicly, 0)
  }, [onSharePublicly])

  return (
    <View style={styles.headerBtns}>
      <HeaderIconButton
        icon="shopping-cart"
        color={cartColor}
        onPress={onToggleAddMode}
        accessibilityLabel={t('shoppingList.addToList')}
      />
      <HeaderIconButton
        icon="calendar"
        onPress={onOpenMealPlanSheet}
        accessibilityLabel={t('mealPlan.addToMealPlan')}
      />
      {recipeActions.length > 0 && (
        <MenuView
          title={t('recipes.recipeActions')}
          actions={recipeActions}
          onPressAction={handleMenuAction}
          onCloseMenu={handleMenuClose}
        >
          <HeaderIconButton icon="share" accessibilityLabel={t('recipes.recipeActions')} />
        </MenuView>
      )}
      <HeaderIconButton
        icon="edit-2"
        size={22}
        onPress={onEdit}
        pending={editPending}
        accessibilityLabel={t('common.edit')}
      />
    </View>
  )
}

export const useRecipeDetailHeader = ({
  navigation,
  editing,
  addMode,
  recipe,
  onToggleAddMode,
  handleEdit,
  editPending,
  handleCancelEdit,
  handleSaveEdit,
  editDirty,
  editSaving,
  handleOpenMealPlanSheet,
  households,
  handlePressRecipeAction,
  handleSharePublicly,
}: {
  navigation: RecipeDetailNavigation
  editing: boolean
  addMode: boolean
  recipe: { household_ids: string[] }
  onToggleAddMode: () => void
  handleEdit: () => void
  editPending: boolean
  handleCancelEdit: () => void
  handleSaveEdit: () => void
  editDirty: boolean
  editSaving: boolean
  handleOpenMealPlanSheet: () => void
  households: HouseholdOut[]
  handlePressRecipeAction: ({ nativeEvent }: { nativeEvent: { event: string } }) => void
  handleSharePublicly: () => void
}) => {
  const { t } = useTranslation()
  const cancelRef = useRef(handleCancelEdit)
  const saveRef = useRef(handleSaveEdit)

  useEffect(() => {
    cancelRef.current = handleCancelEdit
    saveRef.current = handleSaveEdit
  }, [handleCancelEdit, handleSaveEdit])

  const handleCancelPress = useCallback(() => cancelRef.current(), [])
  const handleSavePress = useCallback(() => saveRef.current(), [])

  useLayoutEffect(() => {
    if (editing) {
      const cancelItem: NativeStackHeaderItemButton = {
        type: 'button',
        label: t('common.cancel'),
        accessibilityLabel: t('common.cancel'),
        onPress: handleCancelPress,
      }
      const saveItem: NativeStackHeaderItemButton = {
        type: 'button',
        label: t('common.save'),
        variant: 'prominent',
        tintColor: palette.action,
        disabled: !editDirty || editSaving,
        accessibilityLabel: t('common.save'),
        onPress: handleSavePress,
      }
      const editHeaderOptions = {
        gestureEnabled: false,
        headerTransparent: true,
        headerShadowVisible: false,
        headerLeft: undefined,
        headerRight: undefined,
        headerTitle: () => <EditHeaderTitle dirty={editDirty} />,
        unstable_headerLeftItems: () => [cancelItem],
        unstable_headerRightItems: () => [saveItem],
      }

      navigation.setOptions(editHeaderOptions)
    } else {
      navigation.setOptions({
        gestureEnabled: true,
        headerTransparent: true,
        headerTitle: '',
        headerShadowVisible: false,
        headerLeft: undefined,
        unstable_headerLeftItems: undefined,
        unstable_headerRightItems: undefined,
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
            editPending={editPending}
          />
        ),
      })
    }
  }, [
    navigation,
    editing,
    handleEdit,
    editPending,
    editDirty,
    editSaving,
    handleCancelPress,
    handleSavePress,
    t,
    handleOpenMealPlanSheet,
    households,
    handlePressRecipeAction,
    addMode,
    recipe,
    onToggleAddMode,
  ])
}
