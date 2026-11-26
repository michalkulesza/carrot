import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActionSheetIOS, ActivityIndicator, Alert, Platform, Share, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useLocalSearchParams, useRouter } from "expo-router";
import { useApiClient } from "@carrot/shared/api/context";
import { useRecipes } from "@carrot/shared/hooks/useRecipes";
import { usePreferences, useRecipeServingPreference } from "@carrot/shared/hooks/usePreferences";
import type { RecipeOut } from "@carrot/shared/types";
import { unionAllergens } from "@carrot/shared/utils/unionAllergens";
import { getFullDeleteLabel } from '@carrot/shared/utils/recipeDeleteLabels'
import { useAuth } from "../../context/AuthContext";
import { useRecentActivityWriters } from "../../hooks/useRecentActivity";
import { useHousehold } from "../../context/HouseholdContext";
import type { AddToMealPlanSheetHandle } from "../../components/AddToMealPlanSheet";
import { styles } from "./styles";
import { useDisplayPrefs } from "./useDisplayPrefs";
import { useEditDraft } from "./useEditDraft";
import {
  useRecipeDetailHeader,
  TOGGLE_HOUSEHOLD_PREFIX,
} from "./useRecipeDetailHeader";
import EditView from "./EditView";
import ReadView from "./ReadView";
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
    navAt: navAtParam,
  } = useLocalSearchParams<{
    id: string;
    edit?: string;
    cookMode?: string;
    componentIndex?: string;
    stepIndex?: string;
    navAt?: string;
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
    dismissIssue,
    remove,
    setHouseholds,
    removeFromHousehold,
  } = useRecipes();
  const { preferences } = usePreferences();
  const { households, activeHouseholdId, activeHousehold } = useHousehold();
  const { user } = useAuth();
  const [heroImageErrored, setHeroImageErrored] = useState(false);
  const insets = useSafeAreaInsets();
  const mealPlanSheetRef = useRef<AddToMealPlanSheetHandle>(null);
  const publicSharePendingRef = useRef(false);
  const deletePendingRef = useRef(false);
  const deletePromptOpenRef = useRef(false);
  const deletedByMeRef = useRef(false);
  const recipeSeenRef = useRef(false);
  const recipeRemovedAlertShownRef = useRef(false);

  const { setLastViewed } = useRecentActivityWriters();

  const displayPrefs = useDisplayPrefs();

  const recipe: RecipeOut | undefined = useMemo(
    () => recipes.find((r) => r.id === recipeId),
    [recipes, recipeId],
  );
  const hasSteps = recipe?.components.some((component) => component.steps.length > 0) ?? false
  const forwardedCookKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (cookModeParam !== '1' || !hasSteps) return

    const forwardKey = `${componentIndexParam}|${stepIndexParam}|${navAtParam}`
    if (forwardedCookKeyRef.current === forwardKey) return

    forwardedCookKeyRef.current = forwardKey
    router.push({
      pathname: '/recipe/[id]/cook',
      params: { id: recipeId, componentIndex: componentIndexParam, stepIndex: stepIndexParam, navAt: navAtParam },
    })
  }, [cookModeParam, hasSteps, componentIndexParam, stepIndexParam, navAtParam, recipeId, router])
  const handleRecipeRemoved = useCallback(() => {
    if (recipeRemovedAlertShownRef.current) return
    recipeRemovedAlertShownRef.current = true
    Alert.alert(t('recipes.recipeRemovedTitle'), t('recipes.recipeRemovedMessage'))
    navigation.goBack()
  }, [navigation, t])

  const recipeFound = recipe !== undefined
  useEffect(() => {
    if (recipeFound) void setLastViewed(recipeId)
  }, [recipeFound, recipeId, setLastViewed])

  useEffect(() => {
    if (recipe) {
      recipeSeenRef.current = true
      return
    }
    if (isLoading || error) return

    const removedByOthers = recipeSeenRef.current && !deletedByMeRef.current
    if (removedByOthers) handleRecipeRemoved()
    else router.replace('/(tabs)/home')
  }, [error, isLoading, recipe, router, handleRecipeRemoved])
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
    onRecipeRemoved: handleRecipeRemoved,
  });

  const handleOpenMealPlanSheet = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    mealPlanSheetRef.current?.present();
  }, []);

  const handleToggleFavourite = useCallback(() => {
    if (!recipe) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleFavourite.mutate(recipe.id);
  }, [recipe, toggleFavourite]);

  const handleDeleteEverywhere = useCallback(() => {
    if (!recipe || deletePendingRef.current) return
    deletePendingRef.current = true
    deletedByMeRef.current = true
    void remove.mutateAsync(recipe.id)
      .then(() => navigation.goBack())
      .catch(() => {
        deletedByMeRef.current = false
        Alert.alert(t('common.somethingWentWrong'), t('recipes.failedToDelete'))
      })
      .finally(() => {
        deletePendingRef.current = false
        deletePromptOpenRef.current = false
      })
  }, [navigation, recipe, remove, t])

  const handleRemoveFromHousehold = useCallback(() => {
    if (!recipe || !activeHouseholdId || deletePendingRef.current) return
    deletePendingRef.current = true
    deletedByMeRef.current = true
    void removeFromHousehold.mutateAsync({ id: recipe.id, householdId: activeHouseholdId })
      .then(() => navigation.goBack())
      .catch(() => {
        deletedByMeRef.current = false
        Alert.alert(t('common.somethingWentWrong'), t('recipes.failedToDelete'))
      })
      .finally(() => {
        deletePendingRef.current = false
        deletePromptOpenRef.current = false
      })
  }, [navigation, recipe, activeHouseholdId, removeFromHousehold, t])

  const handleCloseDeletePrompt = useCallback(() => {
    deletePromptOpenRef.current = false
  }, [])

  const handleDeleteRecipe = useCallback(() => {
    if (!recipe || deletePendingRef.current || deletePromptOpenRef.current) return
    deletePromptOpenRef.current = true
    const isAuthor = recipe.author_id === user?.id
    const linkedToActiveHousehold =
      !!activeHouseholdId && recipe.household_ids.includes(activeHouseholdId)

    const buttons: Parameters<typeof Alert.alert>[2] = [
      {
        text: t('common.cancel'),
        style: 'cancel',
        onPress: handleCloseDeletePrompt,
      },
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
        text: getFullDeleteLabel(t, linkedToActiveHousehold ? activeHousehold?.name : null),
        style: 'destructive',
        onPress: handleDeleteEverywhere,
      })
    }

    Alert.alert(
      t('recipes.deleteTitle'),
      t('recipes.deleteConfirm', { title: recipe.title }),
      buttons,
      { onDismiss: handleCloseDeletePrompt },
    )
  }, [recipe, user, activeHouseholdId, activeHousehold, handleRemoveFromHousehold, handleDeleteEverywhere, handleCloseDeletePrompt, t])

  const handleOpenCookMode = useCallback(() => {
    if (!hasSteps) return
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    router.push({ pathname: '/recipe/[id]/cook', params: { id: recipeId } })
  }, [hasSteps, recipeId, router])

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

  useRecipeDetailHeader({
    navigation,
    editing: editDraft.editing,
    recipe: recipe ?? { household_ids: [] },
    handleEdit: editDraft.handleEdit,
    editPending: editDraft.editPending,
    handleCancelEdit: editDraft.handleCancelEdit,
    handleSaveEdit: editDraft.handleSaveEdit,
    editDirty: editDraft.isDirty,
    editSaving: editDraft.saving,
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
        handleNutritionChange={editDraft.handleNutritionChange}
        handleServingsChange={editDraft.handleServingsChange}
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
        uploadingThumb={editDraft.uploadingThumb}
        thumbErrored={editDraft.thumbErrored}
        onDeleteRecipe={handleDeleteRecipe}
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
        unitSystem={preferences?.unit_system ?? "metric"}
        fontSizeIndex={displayPrefs.fontSizeIndex}
        keepScreenOn={displayPrefs.keepScreenOn}
        insets={insets}
        heroImageErrored={heroImageErrored}
        setHeroImageErrored={setHeroImageErrored}
        handleToggleKeepScreenOn={displayPrefs.handleToggleKeepScreenOn}
        handleFontSizeChange={displayPrefs.handleFontSizeChange}
        handleToggleFavourite={handleToggleFavourite}
        handleDecreaseServings={handleDecreaseServings}
        handleIncreaseServings={handleIncreaseServings}
        onOpenCookMode={handleOpenCookMode}
        onDismissIssue={(issueCode) => dismissIssue.mutateAsync({ id: recipe.id, issueCode }).then(() => undefined)}
        onDeleteRecipe={handleDeleteRecipe}
        mealPlanSheetRef={mealPlanSheetRef}
      />
    </>
  );
};

export default RecipeDetailScreen;
