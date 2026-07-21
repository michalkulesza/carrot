import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActionSheetIOS, ActivityIndicator, Alert, Platform, Share, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useLocalSearchParams } from "expo-router";
import { useApiClient } from "@carrot/shared/api/context";
import { useRecipes } from "@carrot/shared/hooks/useRecipes";
import { useShoppingList } from "@carrot/shared/hooks/useShoppingList";
import { usePreferences, useRecipeServingPreference } from "@carrot/shared/hooks/usePreferences";
import type { RecipeOut } from "@carrot/shared/types";
import { useHousehold } from "../../context/HouseholdContext";
import { useResolvedColorScheme } from "../../context/ColorSchemeContext";
import type { AddToMealPlanSheetHandle } from "../../components/AddToMealPlanSheet";
import type { AddIngredientToShoppingListSheetHandle } from "../../components/AddIngredientToShoppingListSheet";
import { styles } from "./styles";
import { useDisplayPrefs } from "./useDisplayPrefs";
import { useEditDraft } from "./useEditDraft";
import {
  useRecipeDetailHeader,
  SEND_TO_HOUSEHOLD_PREFIX,
  SEND_TO_PERSONAL,
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
  const { id: recipeId, edit: autoEditParam } = useLocalSearchParams<{
    id: string;
    edit?: string;
  }>();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const api = useApiClient();
  const {
    recipes,
    isLoading,
    error,
    toggleFavourite,
    linkToHousehold,
    linkToPersonal,
  } = useRecipes();
  const { addItems } = useShoppingList();
  const { preferences } = usePreferences();
  const { households, activeHouseholdId, activeHousehold } = useHousehold();
  const colorScheme = useResolvedColorScheme();
  const [heroImageErrored, setHeroImageErrored] = useState(false);
  const [addMode, setAddMode] = useState(false);
  const [sessionAdded, setSessionAdded] = useState<Set<string>>(new Set());
  const [cookModeOpen, setCookModeOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const mealPlanSheetRef = useRef<AddToMealPlanSheetHandle>(null);
  const addIngredientSheetRef =
    useRef<AddIngredientToShoppingListSheetHandle>(null);
  const pendingIngredientKeyRef = useRef<string | null>(null);
  const publicSharePendingRef = useRef(false);

  const displayPrefs = useDisplayPrefs();

  const recipe: RecipeOut | undefined = useMemo(
    () => recipes.find((r) => r.id === recipeId),
    [recipes, recipeId],
  );
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
      Alert.alert(t('common.ok'), error instanceof Error ? error.message : t('publicShare.createError'));
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
      if (nativeEvent.event === SEND_TO_PERSONAL) {
        linkToPersonal.mutate(recipe.id, {
          onSuccess: () =>
            Alert.alert(t("recipes.recipeAddedToPersonalLibrary")),
          onError: (err) =>
            Alert.alert(
              t("common.ok"),
              err instanceof Error ? err.message : t("addRecipe.failedToAdd"),
            ),
        });
        return;
      }
      if (!nativeEvent.event.startsWith(SEND_TO_HOUSEHOLD_PREFIX)) return;
      const householdId = nativeEvent.event.slice(
        SEND_TO_HOUSEHOLD_PREFIX.length,
      );
      linkToHousehold.mutate(
        { id: recipe.id, householdId },
        {
          onSuccess: () => Alert.alert(t("addRecipe.recipeAddedToHousehold")),
          onError: (err) =>
            Alert.alert(
              t("common.ok"),
              err instanceof Error ? err.message : t("addRecipe.failedToAdd"),
            ),
        },
      );
    },
    [recipe, linkToHousehold, linkToPersonal, t],
  );

  const handleAddIngredient = useCallback((key: string, text: string) => {
    pendingIngredientKeyRef.current = key;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    addIngredientSheetRef.current?.present(text);
  }, []);

  const handleConfirmAddIngredient = useCallback(
    (text: string) => {
      addItems.mutate([text]);
      const key = pendingIngredientKeyRef.current;
      if (key) setSessionAdded((prev) => new Set([...prev, key]));
      pendingIngredientKeyRef.current = null;
    },
    [addItems],
  );

  const handleAddAll = useCallback(
    (keys: string[], texts: string[]) => {
      addItems.mutate(texts);
      setSessionAdded((prev) => new Set([...prev, ...keys]));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [addItems],
  );

  useRecipeDetailHeader({
    navigation,
    editing: editDraft.editing,
    addMode,
    recipe: recipe ?? { household_id: null, shared_to_personal: false },
    activeHouseholdId,
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
          activeHousehold?.allergens ?? preferences?.personal_allergens ?? []
        }
        selectedServings={selectedServings}
        addMode={addMode}
        showStepQty={displayPrefs.showStepQty}
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
      onOpenCookMode={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
        setCookModeOpen(true)
      }}
        mealPlanSheetRef={mealPlanSheetRef}
        addIngredientSheetRef={addIngredientSheetRef}
      />
      <CookMode
        recipe={recipe}
        visible={cookModeOpen}
        onClose={() => setCookModeOpen(false)}
        colorScheme={colorScheme}
      />
    </>
  );
};

export default RecipeDetailScreen;
