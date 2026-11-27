import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { MenuView, type MenuAction } from '@react-native-menu/menu'
import type { NavigationProp, NavigationState } from '@react-navigation/native'
import type { HouseholdOut } from '@carrot/shared/types'
import { buildEditHeaderOptions } from './buildEditHeaderOptions'
import HeaderIconButton from './HeaderIconButton'
import { styles } from './styles'

export const TOGGLE_HOUSEHOLD_PREFIX = 'toggle-household-'
export const SHARE_PUBLICLY = 'share-publicly'

type RecipeDetailNavigation = Omit<NavigationProp<ReactNavigation.RootParamList>, 'getState'> & {
  getState(): NavigationState | undefined
}

const ViewHeaderRight = ({
  recipeHouseholdIds,
  onOpenMealPlanSheet,
  households,
  onPressRecipeAction,
  onSharePublicly,
  onEdit,
  editPending,
}: {
  recipeHouseholdIds: string[]
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
            state: recipeHouseholdIds.includes(h.id) ? 'on' : 'off',
          })),
        },
      ]
    },
    [households, recipeHouseholdIds, t],
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
  recipeHouseholdIds,
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
  recipeHouseholdIds: string[]
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
      const editHeaderOptions = buildEditHeaderOptions({
        t,
        dirty: editDirty,
        saveDisabled: !editDirty || editSaving,
        onCancel: handleCancelPress,
        onSave: handleSavePress,
      })

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
            recipeHouseholdIds={recipeHouseholdIds}
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
    recipeHouseholdIds,
  ])
}
