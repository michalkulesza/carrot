import { useCallback, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation, useLocalSearchParams } from 'expo-router'
import { useApiClient } from '@carrot/shared/api/context'
import { useRecipes } from '@carrot/shared/hooks/useRecipes'
import { useShoppingList } from '@carrot/shared/hooks/useShoppingList'
import { usePreferences } from '@carrot/shared/hooks/usePreferences'
import type { RecipeOut } from '@carrot/shared/types'
import { useDebugMode } from '../../context/DebugModeContext'
import { useHousehold } from '../../context/HouseholdContext'
import type { AddToMealPlanSheetHandle } from '../../components/AddToMealPlanSheet'
import type { AddIngredientToShoppingListSheetHandle } from '../../components/AddIngredientToShoppingListSheet'
import { styles } from './styles'
import { useDisplayPrefs } from './useDisplayPrefs'
import { useEditDraft } from './useEditDraft'
import { useRecipeDetailHeader, SEND_TO_HOUSEHOLD_PREFIX } from './useRecipeDetailHeader'
import EditView from './EditView'
import ReadView from './ReadView'

const RecipeDetailScreen = () => {
  const { id: recipeId, edit: autoEditParam } = useLocalSearchParams<{ id: string; edit?: string }>()
  const navigation = useNavigation()
  const { t } = useTranslation()
  const api = useApiClient()
  const { recipes, isLoading, error, toggleFavourite, linkToHousehold } = useRecipes()
  const { addItems } = useShoppingList()
  const { preferences } = usePreferences()
  const { households } = useHousehold()
  const [heroImageErrored, setHeroImageErrored] = useState(false)
  const [addMode, setAddMode] = useState(false)
  const [sessionAdded, setSessionAdded] = useState<Set<string>>(new Set())
  const insets = useSafeAreaInsets()
  const { enabled: debugMode } = useDebugMode()
  const mealPlanSheetRef = useRef<AddToMealPlanSheetHandle>(null)
  const addIngredientSheetRef = useRef<AddIngredientToShoppingListSheetHandle>(null)
  const pendingIngredientKeyRef = useRef<string | null>(null)

  const displayPrefs = useDisplayPrefs()

  const recipe: RecipeOut | undefined = useMemo(
    () => recipes.find((r) => r.id === recipeId),
    [recipes, recipeId],
  )

  const editDraft = useEditDraft({ recipe, recipeId, autoEditParam, api, t })

  const handleOpenMealPlanSheet = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    mealPlanSheetRef.current?.present()
  }, [])

  const handleToggleAddMode = useCallback(() => setAddMode((prev) => !prev), [])

  const handleToggleFavourite = useCallback(() => {
    if (!recipe) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    toggleFavourite.mutate(recipe.id)
  }, [recipe, toggleFavourite])

  const handlePressRecipeAction = useCallback(
    ({ nativeEvent }: { nativeEvent: { event: string } }) => {
      if (!recipe || !nativeEvent.event.startsWith(SEND_TO_HOUSEHOLD_PREFIX)) return
      const householdId = nativeEvent.event.slice(SEND_TO_HOUSEHOLD_PREFIX.length)
      linkToHousehold.mutate(
        { id: recipe.id, householdId },
        {
          onSuccess: () => Alert.alert(t('addRecipe.recipeAddedToHousehold')),
          onError: (err) =>
            Alert.alert(t('common.ok'), err instanceof Error ? err.message : t('addRecipe.failedToAdd')),
        },
      )
    },
    [recipe, linkToHousehold, t],
  )

  const handleAddIngredient = useCallback((key: string, text: string) => {
    pendingIngredientKeyRef.current = key
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    addIngredientSheetRef.current?.present(text)
  }, [])

  const handleConfirmAddIngredient = useCallback(
    (text: string) => {
      addItems.mutate([text])
      const key = pendingIngredientKeyRef.current
      if (key) setSessionAdded((prev) => new Set([...prev, key]))
      pendingIngredientKeyRef.current = null
    },
    [addItems],
  )

  const handleAddAll = useCallback(
    (keys: string[], texts: string[]) => {
      addItems.mutate(texts)
      setSessionAdded((prev) => new Set([...prev, ...keys]))
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    },
    [addItems],
  )

  useRecipeDetailHeader({
    navigation,
    editing: editDraft.editing,
    addMode,
    onToggleAddMode: handleToggleAddMode,
    handleEdit: editDraft.handleEdit,
    handleCancelEdit: editDraft.handleCancelEdit,
    handleOpenMealPlanSheet,
    households,
    handlePressRecipeAction,
  })

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" accessibilityLabel={t('common.loading')} />
      </View>
    )
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error.message}</Text>
      </View>
    )
  }

  if (!recipe) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{t('recipes.noResults')}</Text>
      </View>
    )
  }

  if (editDraft.editing && editDraft.draft) {
    return (
      <EditView
        recipe={recipe}
        draft={editDraft.draft}
        saving={editDraft.saving}
        insets={insets}
        fontSizeIndex={displayPrefs.fontSizeIndex}
        handlePickThumbnail={editDraft.handlePickThumbnail}
        handleCancelEdit={editDraft.handleCancelEdit}
        handleSaveEdit={editDraft.handleSaveEdit}
        handleUnitSelect={editDraft.handleUnitSelect}
        handleNutritionChange={editDraft.handleNutritionChange}
        updateComp={editDraft.updateComp}
        setIngredient={editDraft.setIngredient}
        addIngredient={editDraft.addIngredient}
        removeIngredient={editDraft.removeIngredient}
        setStep={editDraft.setStep}
        addStep={editDraft.addStep}
        removeStep={editDraft.removeStep}
        setDraft={editDraft.setDraft}
        setThumbErrored={editDraft.setThumbErrored}
        setUnitPickerTarget={editDraft.setUnitPickerTarget}
        uploadingThumb={editDraft.uploadingThumb}
        thumbErrored={editDraft.thumbErrored}
        unitPickerTarget={editDraft.unitPickerTarget}
        currentUnit={editDraft.currentUnit}
      />
    )
  }

  return (
    <ReadView
      recipe={recipe}
      addMode={addMode}
      showStepQty={displayPrefs.showStepQty}
      unitSystem={preferences?.unit_system ?? 'metric'}
      sessionAdded={sessionAdded}
      fontSizeIndex={displayPrefs.fontSizeIndex}
      keepScreenOn={displayPrefs.keepScreenOn}
      debugMode={debugMode}
      insets={insets}
      heroImageErrored={heroImageErrored}
      setHeroImageErrored={setHeroImageErrored}
      handleToggleKeepScreenOn={displayPrefs.handleToggleKeepScreenOn}
      handleFontSizeChange={displayPrefs.handleFontSizeChange}
      handleAddIngredient={handleAddIngredient}
      handleAddAll={handleAddAll}
      handleConfirmAddIngredient={handleConfirmAddIngredient}
      handleToggleFavourite={handleToggleFavourite}
      mealPlanSheetRef={mealPlanSheetRef}
      addIngredientSheetRef={addIngredientSheetRef}
    />
  )
}

export default RecipeDetailScreen
