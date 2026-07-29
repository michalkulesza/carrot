import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActionSheetIOS, ActivityIndicator, Alert, Platform, Share, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useLocalSearchParams, useRouter } from "expo-router";
import { useApiClient } from "@carrot/shared/api/context";
import { useRecipes } from "@carrot/shared/hooks/useRecipes";
import { useShoppingList } from "@carrot/shared/hooks/useShoppingList";
import { usePreferences, useRecipeServingPreference } from "@carrot/shared/hooks/usePreferences";
import type { RecipeOut, ShoppingListItemInput } from "@carrot/shared/types";
import { unionAllergens } from "@carrot/shared/utils/unionAllergens";
import { useAuth } from "../../context/AuthContext";
import { useHousehold } from "../../context/HouseholdContext";
import { useResolvedColorScheme } from "../../context/ColorSchemeContext";
import type { AddToMealPlanSheetHandle } from "../../components/AddToMealPlanSheet";
import type { AddIngredientToShoppingListSheetHandle } from "../../components/AddIngredientToShoppingListSheet";
import { styles } from "./styles";
import { useDisplayPrefs } from "./useDisplayPrefs";
import { useEditDraft } from "./useEditDraft";
import {
  useRecipeDetailHeader,
  TOGGLE_HOUSEHOLD_PREFIX,
} from "./useRecipeDetailHeader";
import EditView from "./EditView";
import ReadView from "./ReadView";
import CookMode from "./CookMode";
import { createMobilePublicShare } from '../../api/client'

const showPublicShareSheet = async (title: string, url: string): Promise<void> => {
  if (Platform.OS !== 'ios') {
    await Share.share({ title, url, message: url });
    return;
  }

  await new Promise<void>((resolve, reject) => {
    ActionSheetIOS.showShareActionSheetWithOptions(
      { subject: title, url },
      reject,
      () => resolve(),
    );
  });
}

const RecipeDetailScreen = () => {
  const {
    id: recipeId,
    edit: autoEditParam,
    cookMode: cookModeParam,
    componentIndex: componentIndexParam,
    stepIndex: stepIndexParam,
  } = useLocalSearchParams<{
    id: string;
    edit?: string;
    cookMode?: string;
    componentIndex?: string;
    stepIndex?: string;
  }>();
  const navigation = useNavigation();
  const router = useRouter();
  const { t } = useTranslation();
  const api = useApiClient();
  const {
    recipes,
    isLoading,
    error,
    toggleFavourite,
    remove,
    setHouseholds,
    removeFromHousehold,
  } = useRecipes();
  const { addItems } = useShoppingList();
  const { preferences } = usePreferences();
  const { households, activeHouseholdId, activeHousehold } = useHousehold();
  const { user } = useAuth();
  const colorScheme = useResolvedColorScheme();
  const [heroImageErrored, setHeroImageErrored] = useState(false);
  const [addMode, setAddMode] = useState(false);
  const [sessionAdded, setSessionAdded] = useState<Set<string>>(new Set());
  const [cookModeOpen, setCookModeOpen] = useState(cookModeParam === '1');
  const insets = useSafeAreaInsets();
  const mealPlanSheetRef = useRef<AddToMealPlanSheetHandle>(null);
  const addIngredientSheetRef =
    useRef<AddIngredientToShoppingListSheetHandle>(null);
  const pendingIngredientKeyRef = useRef<string | null>(null);
  const publicSharePendingRef = useRef(false);
  const deletePendingRef = useRef(false);

  const displayPrefs = useDisplayPrefs();
  const initialComponentIndex = Number.isInteger(Number(componentIndexParam))
    ? Number(componentIndexParam)
    : null
  const initialStepIndex = Number.isInteger(Number(stepIndexParam))
    ? Number(stepIndexParam)
    : null

  useEffect(() => {
    if (cookModeParam === '1') setCookModeOpen(true)
  }, [cookModeParam])

  const recipe: RecipeOut | undefined = useMemo(
    () => recipes.find((r) => r.id === recipeId),
    [recipes, recipeId],
  );
  useEffect(() => {
    if (!isLoading && !error && !recipe) router.replace('/(tabs)/recipes')
  }, [error, isLoading, recipe, router])
  const { selectedServings, setServings } = useRecipeServingPreference(
    recipe?.id,
    recipe?.servings ?? null,
  );

  const handleEditSaveSuccess = useCallback((updated: RecipeOut) => {
    if (updated.servings !== null) setServings(updated.servings);
  }, [setServings]);

  const editDraft = useEditDraft({
    recipe,
    recipeId,
    autoEditParam,
    api,
    t,
    onSaveSuccess: handleEditSaveSuccess,
  });

  const handleOpenMealPlanSheet = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    mealPlanSheetRef.current?.present();
  }, []);

  const handleToggleAddMode = useCallback(
    () => setAddMode((prev) => !prev),
    [],
  );

  const handleToggleFavourite = useCallback(() => {
    if (!recipe) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleFavourite.mutate(recipe.id);
  }, [recipe, toggleFavourite]);

  const handleDeleteEverywhere = useCallback(() => {
    if (!recipe || deletePendingRef.current) return
    deletePendingRef.current = true
    void remove.mutateAsync(recipe.id)
      .then(() => navigation.goBack())
      .catch(() => Alert.alert(t('common.somethingWentWrong'), t('recipes.failedToDelete')))
      .finally(() => { deletePendingRef.current = false })
  }, [navigation, recipe, remove, t])

  const handleRemoveFromHousehold = useCallback(() => {
    if (!recipe || !activeHouseholdId || deletePendingRef.current) return
    deletePendingRef.current = true
    void removeFromHousehold.mutateAsync({ id: recipe.id, householdId: activeHouseholdId })
      .then(() => navigation.goBack())
      .catch(() => Alert.alert(t('common.somethingWentWrong'), t('recipes.failedToDelete')))
      .finally(() => { deletePendingRef.current = false })
  }, [navigation, recipe, activeHouseholdId, removeFromHousehold, t])

  const handleDeleteRecipe = useCallback(() => {
    if (!recipe || deletePendingRef.current) return
    const isAuthor = recipe.author_id === user?.id
    const linkedToActiveHousehold =
      !!activeHouseholdId && recipe.household_ids.includes(activeHouseholdId)

    const buttons: Parameters<typeof Alert.alert>[2] = [
      { text: t('common.cancel'), style: 'cancel' },
    ]
    if (linkedToActiveHousehold && activeHousehold) {
      buttons.push({
        text: t('recipes.deleteFromHousehold', { name: activeHousehold.name }),
        style: 'destructive',
        onPress: handleRemoveFromHousehold,
      })
    }
    if (isAuthor) {
      buttons.push({
        text: t('recipes.deleteEverywhere'),
        style: 'destructive',
        onPress: handleDeleteEverywhere,
      })
    }

    Alert.alert(t('recipes.deleteTitle'), t('recipes.deleteConfirm', { title: recipe.title }), buttons)
  }, [recipe, user, activeHouseholdId, activeHousehold, handleRemoveFromHousehold, handleDeleteEverywhere, t])

  const handleOpenCookMode = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setCookModeOpen(true)
  }, [])

  const handleDecreaseServings = useCallback(() => {
    if (selectedServings !== null) setServings(Math.max(1, selectedServings - 1));
    void Haptics.selectionAsync();
  }, [selectedServings, setServings]);

  const handleIncreaseServings = useCallback(() => {
    if (selectedServings !== null) setServings(Math.min(99, selectedServings + 1));
    void Haptics.selectionAsync();
  }, [selectedServings, setServings]);

  const handleSharePublicly = useCallback(async () => {
    if (!recipe || publicSharePendingRef.current) return;
    publicSharePendingRef.current = true;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const share = await createMobilePublicShare(recipe.id);

      await showPublicShareSheet(recipe.title, share.url);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(t('common.somethingWentWrong'), error instanceof Error ? error.message : t('publicShare.createError'));
    } finally {
      publicSharePendingRef.current = false;
    }
  }, [recipe, t]);

  const startPublicShare = useCallback(() => {
    void handleSharePublicly();
  }, [handleSharePublicly]);

  const handlePressRecipeAction = useCallback(
    ({ nativeEvent }: { nativeEvent: { event: string } }) => {
      if (!recipe) return;
      if (!nativeEvent.event.startsWith(TOGGLE_HOUSEHOLD_PREFIX)) return;
      const householdId = nativeEvent.event.slice(TOGGLE_HOUSEHOLD_PREFIX.length);
      const householdIds = recipe.household_ids.includes(householdId)
        ? recipe.household_ids.filter((id) => id !== householdId)
        : [...recipe.household_ids, householdId];
      setHouseholds.mutate(
        { id: recipe.id, householdIds },
        {
          onError: (err) =>
            Alert.alert(
              t("common.somethingWentWrong"),
              err instanceof Error ? err.message : t("addRecipe.failedToAdd"),
            ),
        },
      );
    },
    [recipe, setHouseholds, t],
  );

  const handleAddIngredient = useCallback((key: string, item: ShoppingListItemInput) => {
    pendingIngredientKeyRef.current = key;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    addIngredientSheetRef.current?.present(item);
  }, []);

  const handleConfirmAddIngredient = useCallback(
    (item: ShoppingListItemInput) => {
      addItems.mutate([item]);
      const key = pendingIngredientKeyRef.current;
      if (key) setSessionAdded((previous) => new Set([...previous, key]));
      pendingIngredientKeyRef.current = null;
    },
    [addItems],
  );

  const handleAddAll = useCallback(
    (keys: string[], items: ShoppingListItemInput[]) => {
      addItems.mutate(items);
      setSessionAdded((previous) => new Set([...previous, ...keys]));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [addItems],
  );

  useRecipeDetailHeader({
    navigation,
    editing: editDraft.editing,
    cooking: cookModeOpen,
    addMode,
    recipe: recipe ?? { household_ids: [] },
    onToggleAddMode: handleToggleAddMode,
    handleEdit: editDraft.handleEdit,
    handleCancelEdit: editDraft.handleCancelEdit,
    handleOpenMealPlanSheet,
    households,
    handlePressRecipeAction,
    handleSharePublicly: startPublicShare,
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          accessibilityLabel={t("common.loading")}
        />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error.message}</Text>
      </View>
    );
  }

  if (!recipe) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{t("recipes.noResults")}</Text>
      </View>
    );
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
        handleQtyUnitChange={editDraft.handleQtyUnitChange}
        handleNutritionChange={editDraft.handleNutritionChange}
        updateComp={editDraft.updateComp}
        setIngredient={editDraft.setIngredient}
        setIngredientCategory={editDraft.setIngredientCategory}
        addIngredient={editDraft.addIngredient}
        removeIngredient={editDraft.removeIngredient}
        setStep={editDraft.setStep}
        addStep={editDraft.addStep}
        removeStep={editDraft.removeStep}
        setDraft={editDraft.setDraft}
        setThumbErrored={editDraft.setThumbErrored}
        setQtyUnitPickerTarget={editDraft.setQtyUnitPickerTarget}
        uploadingThumb={editDraft.uploadingThumb}
        thumbErrored={editDraft.thumbErrored}
        qtyUnitPickerTarget={editDraft.qtyUnitPickerTarget}
        currentQty={editDraft.currentQty}
        currentUnit={editDraft.currentUnit}
      />
    );
  }

  return (
    <>
      <ReadView
        recipe={recipe}
        activeAllergens={
          unionAllergens(activeHousehold?.allergens, preferences?.personal_allergens)
        }
        selectedServings={selectedServings}
        addMode={addMode}
        unitSystem={preferences?.unit_system ?? "metric"}
        sessionAdded={sessionAdded}
        fontSizeIndex={displayPrefs.fontSizeIndex}
        keepScreenOn={displayPrefs.keepScreenOn}
        insets={insets}
        heroImageErrored={heroImageErrored}
        setHeroImageErrored={setHeroImageErrored}
        handleToggleKeepScreenOn={displayPrefs.handleToggleKeepScreenOn}
        handleFontSizeChange={displayPrefs.handleFontSizeChange}
        handleAddIngredient={handleAddIngredient}
        handleAddAll={handleAddAll}
        handleConfirmAddIngredient={handleConfirmAddIngredient}
        handleToggleFavourite={handleToggleFavourite}
        handleDecreaseServings={handleDecreaseServings}
        handleIncreaseServings={handleIncreaseServings}
        onOpenCookMode={handleOpenCookMode}
        onDeleteRecipe={handleDeleteRecipe}
        mealPlanSheetRef={mealPlanSheetRef}
        addIngredientSheetRef={addIngredientSheetRef}
      />
      <CookMode
        recipe={recipe}
        visible={cookModeOpen}
        onClose={() => setCookModeOpen(false)}
        colorScheme={colorScheme}
        initialComponentIndex={initialComponentIndex}
        initialStepIndex={initialStepIndex}
        selectedServings={selectedServings}
        unitSystem={preferences?.unit_system ?? "metric"}
      />
    </>
  );
};

export default RecipeDetailScreen;
