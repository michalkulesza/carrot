import { useCallback, useState, type RefObject } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Linking,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
  type NativeSyntheticEvent,
  type TextLayoutEventData,
} from "react-native";
import NetworkImage from "../../components/NetworkImage";
import { useTranslation } from "react-i18next";
import { useHousehold } from "../../context/HouseholdContext";
import { Feather, Ionicons } from "@expo/vector-icons";
import type { EdgeInsets } from "react-native-safe-area-context";
import type { RecipeIssueCode, RecipeOut, ShoppingListItemInput } from "@carrot/shared/types";
import AddToMealPlanSheet, {
  type AddToMealPlanSheetHandle,
} from "../../components/AddToMealPlanSheet";
import AddIngredientToShoppingListSheet, {
  type AddIngredientToShoppingListSheetHandle,
} from "../../components/AddIngredientToShoppingListSheet";
import NutritionBoxGrid, {
  TooltipPopover,
} from "../../components/NutritionBoxGrid";
import { colors } from "../../theme/colors";
import { proxyThumbnailUrl, PLACEHOLDER_URL } from "../../api/thumbnailUrl";
import { styles } from "./styles";
import { FONT_SIZES, LINE_HEIGHTS } from "./helpers";
import ComponentSection from "./ComponentSection";
import UnifiedIngredientsSection from "./UnifiedIngredientsSection";
import NotesSection from "./NotesSection";
import RelatedRecipesSection from "./RelatedRecipesSection";
import TagsSection from "./TagsSection";
import ServingStepper from "./ServingStepper";
import RecipeMemberRow from './RecipeMemberRow'
import RecipeIssueBanner from './RecipeIssueBanner'

const formatCookingTime = (
  minutes: number | null,
  t: (key: string) => string,
) => {
  if (minutes === null) return "";
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0) return `${minutes}${t("recipes.minutesShort")}`;
  if (remainingMinutes === 0) return `${hours}${t("recipes.hoursShort")}`;
  return `${hours}${t("recipes.hoursShort")}${remainingMinutes}${t("recipes.minutesShort")}`;
};

const ReadView = ({
  recipe,
  activeAllergens,
  selectedServings,
  addMode,
  unitSystem,
  sessionAdded,
  fontSizeIndex,
  keepScreenOn,
  insets,
  heroImageErrored,
  setHeroImageErrored,
  handleToggleKeepScreenOn,
  handleFontSizeChange,
  handleAddIngredient,
  handleAddAll,
  handleConfirmAddIngredient,
  handleToggleFavourite,
  handleDecreaseServings,
  handleIncreaseServings,
  onOpenCookMode,
  onDismissIssue,
  onDeleteRecipe,
  mealPlanSheetRef,
  addIngredientSheetRef,
}: {
  recipe: RecipeOut;
  activeAllergens: string[];
  selectedServings: number | null;
  addMode: boolean;
  unitSystem: string;
  sessionAdded: Set<string>;
  fontSizeIndex: number;
  keepScreenOn: boolean;
  insets: EdgeInsets;
  heroImageErrored: boolean;
  setHeroImageErrored: (errored: boolean) => void;
  handleToggleKeepScreenOn: (val: boolean) => void;
  handleFontSizeChange: (index: number) => void;
  handleAddIngredient: (key: string, item: ShoppingListItemInput) => void;
  handleAddAll: (keys: string[], items: ShoppingListItemInput[]) => void;
  handleConfirmAddIngredient: (item: ShoppingListItemInput) => void;
  handleToggleFavourite: () => void;
  handleDecreaseServings: () => void;
  handleIncreaseServings: () => void;
  onOpenCookMode: () => void;
  onDismissIssue: (issueCode: RecipeIssueCode) => Promise<void>;
  onDeleteRecipe: () => void;
  mealPlanSheetRef: RefObject<AddToMealPlanSheetHandle | null>;
  addIngredientSheetRef: RefObject<AddIngredientToShoppingListSheetHandle | null>;
}) => {
  const { t } = useTranslation();
  const { households } = useHousehold();
  const heroThumbnailUrl = proxyThumbnailUrl(recipe.thumbnail_url);
  const hasImage = !!heroThumbnailUrl;
  const hasScalableServings = recipe.servings !== null && recipe.servings > 0;
  const hasSteps = recipe.components.some((component) => component.steps.length > 0);
  const valueLabel = (label: string, status: string | undefined) =>
    status === "ai" ? `${label} · ${t("recipes.valueAi")}` : label;
  const nutritionProvenance = recipe.nutrition_provenance;
  const kcalIsAi = nutritionProvenance?.kcal_per_serving?.status === "ai";
  const proteinIsAi = nutritionProvenance?.protein_per_serving?.status === "ai";
  const fatIsAi = nutritionProvenance?.fat_per_serving?.status === "ai";
  const carbsIsAi = nutritionProvenance?.carbs_per_serving?.status === "ai";
  const nutritionItems = [
    {
      label: valueLabel(t("recipes.totalTime"), recipe.total_time_provenance?.status),
      value: formatCookingTime(recipe.total_time_minutes, t),
      accessibilityLabel: t("recipes.totalTime"),
      valueFontSize:
        recipe.total_time_minutes !== null && recipe.total_time_minutes >= 60
          ? 15
          : undefined,
    },
    {
      label: valueLabel(t("recipes.colKcal"), nutritionProvenance?.kcal_per_serving?.status),
      value: recipe.kcal_per_serving?.toString() ?? "",
      accessibilityLabel: t("recipes.kcalPerServing"),
      showDisclaimer: kcalIsAi,
    },
    {
      label: valueLabel(t("recipes.protein"), nutritionProvenance?.protein_per_serving?.status),
      value: recipe.protein_per_serving?.toString() ?? "",
      accessibilityLabel: t("recipes.proteinPerServing"),
      unit: "g",
      showDisclaimer: proteinIsAi,
    },
    {
      label: valueLabel(t("recipes.fat"), nutritionProvenance?.fat_per_serving?.status),
      value: recipe.fat_per_serving?.toString() ?? "",
      accessibilityLabel: t("recipes.fatPerServing"),
      unit: "g",
      showDisclaimer: fatIsAi,
    },
    {
      label: valueLabel(t("recipes.carbs"), nutritionProvenance?.carbs_per_serving?.status),
      value: recipe.carbs_per_serving?.toString() ?? "",
      accessibilityLabel: t("recipes.carbsPerServing"),
      unit: "g",
      showDisclaimer: carbsIsAi,
    },
  ];
  const [titleIsSingleLine, setTitleIsSingleLine] = useState(true);
  const handleTitleTextLayout = useCallback(
    (e: NativeSyntheticEvent<TextLayoutEventData>) => {
      setTitleIsSingleLine(e.nativeEvent.lines.length <= 1);
    },
    [],
  );
  const servingScale =
    recipe.servings && selectedServings
      ? selectedServings / recipe.servings
      : 1;
  const recipeMembers = recipe.household_ids
    .map((id) => households.find((h) => h.id === id))
    .filter((h): h is NonNullable<typeof h> => !!h)
    .map((h) => ({ id: h.id, name: h.name, color: h.color }));

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="never"
        onTouchStart={Keyboard.dismiss}
      >
        {hasImage && !heroImageErrored ? (
          <NetworkImage
            uri={heroThumbnailUrl!}
            style={styles.heroImage}
            accessibilityLabel={recipe.title}
            recyclingKey={heroThumbnailUrl}
            onError={() => setHeroImageErrored(true)}
          />
        ) : hasImage && heroImageErrored && PLACEHOLDER_URL ? (
          <NetworkImage
            uri={PLACEHOLDER_URL}
            style={styles.heroImage}
            accessibilityLabel={recipe.title}
          />
        ) : (
          <View style={{ height: insets.top + 56 }} />
        )}

        <View style={styles.card}>
          <View
            style={[
              styles.titleRow,
              titleIsSingleLine && styles.titleRowSingleLine,
            ]}
          >
            <Pressable
              onPress={handleToggleFavourite}
              hitSlop={8}
              style={({ pressed }) => [
                styles.favBtn,
                pressed && { opacity: 0.7 },
              ]}
              accessibilityLabel={
                recipe.is_favourite
                  ? t("recipes.removeFromFavourites")
                  : t("recipes.addToFavourites")
              }
              accessibilityRole="button"
            >
              <Ionicons
                name={recipe.is_favourite ? "star" : "star-outline"}
                size={24}
                color={recipe.is_favourite ? "#f59e0b" : colors.opaqueSeparator}
              />
            </Pressable>
            {recipe.source_url ? (
              <Pressable
                onPress={() => void Linking.openURL(recipe.source_url!)}
                style={({ pressed }) => [
                  styles.titleLinkWrap,
                  pressed && { opacity: 0.7 },
                ]}
                accessibilityLabel={recipe.title}
                accessibilityRole="link"
              >
                <Text style={styles.title} onTextLayout={handleTitleTextLayout}>
                  {recipe.title}{" "}
                  <Feather name="link" size={20} color={colors.label} />
                </Text>
              </Pressable>
            ) : (
              <Text style={styles.title} onTextLayout={handleTitleTextLayout}>
                {recipe.title}
              </Text>
            )}
          </View>

          <TagsSection recipe={recipe} />
          <RecipeIssueBanner issueCodes={recipe.issue_codes ?? []} sourceUrl={recipe.source_url} onDismiss={onDismissIssue} />
          {recipe.allergen_status === 'uncertain' && <Text style={styles.uncertainAllergens}>{t('recipes.allergensUncertain')}</Text>}

          <NutritionBoxGrid
            editing={false}
            items={nutritionItems}
            disclaimerText={t("recipes.nutritionEstimateDisclaimer")}
          />

          {hasScalableServings && selectedServings !== null && (
            <ServingStepper
              servings={selectedServings}
              onDecrease={handleDecreaseServings}
              onIncrease={handleIncreaseServings}
            />
          )}

          <RecipeMemberRow members={recipeMembers} onDeleteRecipe={onDeleteRecipe} />

          <View style={styles.toggleGroup}>
            <View style={styles.keepScreenRow}>
              <Text style={styles.keepScreenLabel}>
                {t("settings.screenAwake")}
              </Text>
              <Switch
                value={keepScreenOn}
                onValueChange={handleToggleKeepScreenOn}
                accessibilityLabel={t("settings.screenAwake")}
              />
            </View>
            <View style={styles.toggleDivider} />
            <View style={styles.keepScreenRow}>
              <Text style={styles.keepScreenLabel}>
                {t("settings.textSize")}
              </Text>
              <View style={styles.fontSizeControl}>
                <Ionicons name="text" size={13} color={colors.secondaryLabel} />
                <View style={styles.fontSizeTrack}>
                  <View style={styles.fontSizeTrackLine} />
                  {FONT_SIZES.map((_, i) => (
                    <Pressable
                      key={i}
                      onPress={() => handleFontSizeChange(i)}
                      hitSlop={10}
                      style={styles.fontSizeDotWrapper}
                      accessibilityRole="radio"
                      accessibilityLabel={`${t("settings.textSize")} ${i + 1}`}
                    >
                      <View
                        style={[
                          styles.fontSizeDot,
                          fontSizeIndex === i && styles.fontSizeDotActive,
                        ]}
                      />
                    </Pressable>
                  ))}
                </View>
                <Ionicons name="text" size={20} color={colors.secondaryLabel} />
              </View>
            </View>
          </View>

          <Pressable
            onPress={hasSteps ? onOpenCookMode : undefined}
            disabled={!hasSteps}
            style={({ pressed }) => [
              styles.cookModeButton,
              pressed && { opacity: 0.8 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t("cookMode.start")}
          >
            <Ionicons name="play-circle-outline" size={20} color="#fff" />
            <Text style={styles.cookModeButtonText}>{t("cookMode.start")}</Text>
          </Pressable>
          {!hasSteps && <Text style={styles.cookModeUnavailable}>{t('recipes.cookModeUnavailable')}</Text>}

          <RelatedRecipesSection recipeId={recipe.id} />
          <NotesSection recipe={recipe} fontSizeIndex={fontSizeIndex} />

          {recipe.components.length > 0 && (
            <UnifiedIngredientsSection
              components={recipe.components}
              unitSystem={unitSystem}
              servingScale={servingScale}
              addMode={addMode}
              sessionAdded={sessionAdded}
              onAdd={handleAddIngredient}
              onAddAll={handleAddAll}
              activeAllergens={activeAllergens}
              fontSize={FONT_SIZES[fontSizeIndex]}
              lineHeight={LINE_HEIGHTS[fontSizeIndex]}
            />
          )}

          {recipe.components.map((component, i) => (
            <ComponentSection
              key={i}
              component={component}
              index={i}
              recipe={recipe}
              addMode={addMode}
              unitSystem={unitSystem}
              servingScale={servingScale}
              sessionAdded={sessionAdded}
              onAdd={handleAddIngredient}
              onAddAll={handleAddAll}
              fontSize={FONT_SIZES[fontSizeIndex]}
              lineHeight={LINE_HEIGHTS[fontSizeIndex]}
              collapsible={recipe.components.length > 1}
              showIngredients={recipe.components.length > 1}
              showGroupHeader={recipe.components.length > 1}
              activeAllergens={activeAllergens}
            />
          ))}
        </View>
      </ScrollView>
      <AddToMealPlanSheet ref={mealPlanSheetRef} recipeId={recipe.id} />
      <AddIngredientToShoppingListSheet
        ref={addIngredientSheetRef}
        onConfirm={handleConfirmAddIngredient}
      />
    </View>
  );
};

export default ReadView;
