import { useCallback, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation, useLocalSearchParams } from 'expo-router'
import { useApiClient } from '@carrot/shared/api/context'
import { useRecipes } from '@carrot/shared/hooks/useRecipes'
import { useShoppingList } from '@carrot/shared/hooks/useShoppingList'
import { useTags } from '@carrot/shared/hooks/useTags'
import type { RecipeOut } from '@carrot/shared/types'
import { useDebugMode } from '../../context/DebugModeContext'
import type { AddToMealPlanSheetHandle } from '../../components/AddToMealPlanSheet'
import type { AddIngredientToShoppingListSheetHandle } from '../../components/AddIngredientToShoppingListSheet'
import { styles } from './styles'
import { useDisplayPrefs } from './useDisplayPrefs'
import { useEditDraft } from './useEditDraft'
import { useRecipeDetailHeader } from './useRecipeDetailHeader'
import EditView from './EditView'
import ReadView from './ReadView'

const RecipeDetailScreen = () => {
  const { id: recipeId, edit: autoEditParam } = useLocalSearchParams<{ id: string; edit?: string }>()
  const navigation = useNavigation()
  const { t } = useTranslation()
  const api = useApiClient()
  const { recipes, isLoading, error, toggleFavourite } = useRecipes()
  const { addItems } = useShoppingList()
  const { tags: allTags, create: createTagMutation } = useTags()
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

  const createTag = useCallback((name: string) => createTagMutation.mutateAsync(name), [createTagMutation])

  const editDraft = useEditDraft({ recipe, recipeId, autoEditParam, api, t, createTag })

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
        draft={editDraft.draft}
        selectedTags={editDraft.selectedTags}
        saving={editDraft.saving}
        allTags={allTags}
        insets={insets}
        handlePickThumbnail={editDraft.handlePickThumbnail}
        handleTagAdd={editDraft.handleTagAdd}
        handleTagRemove={editDraft.handleTagRemove}
        handleTagCreate={editDraft.handleTagCreate}
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
        setShowTagPicker={editDraft.setShowTagPicker}
        uploadingThumb={editDraft.uploadingThumb}
        thumbErrored={editDraft.thumbErrored}
        unitPickerTarget={editDraft.unitPickerTarget}
        showTagPicker={editDraft.showTagPicker}
        currentUnit={editDraft.currentUnit}
      />
    )
  }

  return (
    <ReadView
      recipe={recipe}
      addMode={addMode}
      showStepQty={displayPrefs.showStepQty}
      sessionAdded={sessionAdded}
      fontSizeIndex={displayPrefs.fontSizeIndex}
      keepScreenOn={displayPrefs.keepScreenOn}
      debugMode={debugMode}
      insets={insets}
      heroImageErrored={heroImageErrored}
      setHeroImageErrored={setHeroImageErrored}
      handleToggleKeepScreenOn={displayPrefs.handleToggleKeepScreenOn}
      handleToggleShowStepQty={displayPrefs.handleToggleShowStepQty}
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
