import type { RefObject } from 'react'
import { ActivityIndicator, Linking, Pressable, ScrollView, Switch, Text, View } from 'react-native'
import Avatar from '../../components/Avatar'
import NetworkImage from '../../components/NetworkImage'
import { useTranslation } from 'react-i18next'
import { useHousehold } from '../../context/HouseholdContext'
import { useAuth } from '../../context/AuthContext'
import { Feather, Ionicons } from '@expo/vector-icons'
import type { EdgeInsets } from 'react-native-safe-area-context'
import type { RecipeOut } from '@carrot/shared/types'
import { tTag } from '@carrot/shared/utils/tagUtils'
import AddToMealPlanSheet, { type AddToMealPlanSheetHandle } from '../../components/AddToMealPlanSheet'
import AddIngredientToShoppingListSheet, {
  type AddIngredientToShoppingListSheetHandle,
} from '../../components/AddIngredientToShoppingListSheet'
import NutritionBoxGrid from '../../components/NutritionBoxGrid'
import { colors } from '../../theme/colors'
import { proxyThumbnailUrl, PLACEHOLDER_URL } from '../../api/thumbnailUrl'
import { styles } from './styles'
import { FONT_SIZES, LINE_HEIGHTS } from './helpers'
import ComponentSection from './ComponentSection'

const ReadView = ({
  recipe,
  addMode,
  showStepQty,
  sessionAdded,
  fontSizeIndex,
  keepScreenOn,
  debugMode,
  insets,
  heroImageErrored,
  setHeroImageErrored,
  handleToggleKeepScreenOn,
  handleToggleShowStepQty,
  handleFontSizeChange,
  handleAddIngredient,
  handleAddAll,
  handleConfirmAddIngredient,
  handleToggleFavourite,
  mealPlanSheetRef,
  addIngredientSheetRef,
}: {
  recipe: RecipeOut
  addMode: boolean
  showStepQty: boolean
  sessionAdded: Set<string>
  fontSizeIndex: number
  keepScreenOn: boolean
  debugMode: boolean
  insets: EdgeInsets
  heroImageErrored: boolean
  setHeroImageErrored: (errored: boolean) => void
  handleToggleKeepScreenOn: (val: boolean) => void
  handleToggleShowStepQty: (val: boolean) => void
  handleFontSizeChange: (index: number) => void
  handleAddIngredient: (key: string, text: string) => void
  handleAddAll: (keys: string[], texts: string[]) => void
  handleConfirmAddIngredient: (text: string) => void
  handleToggleFavourite: () => void
  mealPlanSheetRef: RefObject<AddToMealPlanSheetHandle | null>
  addIngredientSheetRef: RefObject<AddIngredientToShoppingListSheetHandle | null>
}) => {
  const { t } = useTranslation()
  const { households } = useHousehold()
  const { user } = useAuth()
  const hasImage = !!recipe.thumbnail_url
  const personalName = user?.nickname || user?.email || t('households.personal')
  const recipeHousehold = recipe.household_id ? households.find((h) => h.id === recipe.household_id) : undefined
  const householdAvatarProps = recipeHousehold
    ? { name: recipeHousehold.name, color: recipeHousehold.color }
    : { name: personalName }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
        contentInsetAdjustmentBehavior="never"
      >
        {hasImage && !heroImageErrored ? (
          <NetworkImage
            uri={proxyThumbnailUrl(recipe.thumbnail_url!)!}
            style={styles.heroImage}
            accessibilityLabel={recipe.title}
            recyclingKey={recipe.thumbnail_url}
            onError={() => setHeroImageErrored(true)}
          />
        ) : hasImage && heroImageErrored && PLACEHOLDER_URL ? (
          <NetworkImage uri={PLACEHOLDER_URL} style={styles.heroImage} accessibilityLabel={recipe.title} />
        ) : (
          <View style={{ height: insets.top + 56 }} />
        )}

        <View style={styles.card}>
          <View style={styles.titleRow}>
            <Pressable
              onPress={handleToggleFavourite}
              hitSlop={8}
              style={({ pressed }) => [styles.favBtn, pressed && { opacity: 0.7 }]}
              accessibilityLabel={
                recipe.is_favourite ? t('recipes.removeFromFavourites') : t('recipes.addToFavourites')
              }
              accessibilityRole="button"
            >
              <Ionicons
                name={recipe.is_favourite ? 'star' : 'star-outline'}
                size={24}
                color={recipe.is_favourite ? '#f59e0b' : colors.opaqueSeparator}
              />
            </Pressable>
            {recipe.source_url ? (
              <Pressable
                onPress={() => void Linking.openURL(recipe.source_url!)}
                style={({ pressed }) => [styles.titleLinkWrap, pressed && { opacity: 0.7 }]}
                accessibilityLabel={recipe.title}
                accessibilityRole="link"
              >
                <Text style={styles.title}>
                  {recipe.title}{' '}
                  <Feather name="link" size={20} color={colors.label} />
                </Text>
              </Pressable>
            ) : (
              <Text style={styles.title}>{recipe.title}</Text>
            )}
          </View>

          {recipe.tags.length > 0 && (
            <View style={styles.tagRow}>
              {recipe.tags.map((tag) => (
                <View key={tag.id} style={styles.tag}>
                  <Text style={styles.tagText}>{tTag(tag.name, t)}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.householdRow}>
            <Avatar {...householdAvatarProps} size={28} />
          </View>

          <NutritionBoxGrid
            editing={false}
            items={[
              { label: t('recipes.serves'), value: recipe.servings?.toString() ?? '', accessibilityLabel: t('recipes.serves') },
              { label: t('recipes.colKcal'), value: recipe.kcal_per_serving?.toString() ?? '', accessibilityLabel: t('recipes.kcalPerServing') },
              { label: t('recipes.protein'), value: recipe.protein_per_serving?.toString() ?? '', accessibilityLabel: t('recipes.proteinPerServing'), unit: 'g' },
              { label: t('recipes.fat'), value: recipe.fat_per_serving?.toString() ?? '', accessibilityLabel: t('recipes.fatPerServing'), unit: 'g' },
              { label: t('recipes.carbs'), value: recipe.carbs_per_serving?.toString() ?? '', accessibilityLabel: t('recipes.carbsPerServing'), unit: 'g' },
            ]}
            disclaimerText={t('recipes.nutritionEstimateDisclaimer')}
          />

          {debugMode && recipe.debug_model ? (
            <View style={styles.debugBox}>
              <Text style={styles.debugTitle}>{t('recipes.debugInfo')}</Text>
              <Text style={styles.debugText}>
                {t('recipes.debugModel')}: {recipe.debug_model}
              </Text>
              <Text style={styles.debugText}>
                {t('recipes.debugTokens')}: {recipe.debug_total_tokens ?? '—'}
                {' '}({t('recipes.debugInputTokens')} {recipe.debug_input_tokens ?? '—'}
                {' · '}{t('recipes.debugOutputTokens')} {recipe.debug_output_tokens ?? '—'})
              </Text>
            </View>
          ) : null}

          <View style={styles.toggleGroup}>
            <View style={styles.keepScreenRow}>
              <Text style={styles.keepScreenLabel}>{t('settings.cookingMode')}</Text>
              <Switch
                value={keepScreenOn}
                onValueChange={handleToggleKeepScreenOn}
                accessibilityLabel={t('settings.cookingMode')}
              />
            </View>
            <View style={styles.toggleDivider} />
            <View style={styles.keepScreenRow}>
              <Text style={styles.keepScreenLabel}>{t('settings.showIntelligentIngredients')}</Text>
              <Switch
                value={showStepQty}
                onValueChange={handleToggleShowStepQty}
                accessibilityLabel={t('settings.showIntelligentIngredients')}
              />
            </View>
            <View style={styles.toggleDivider} />
            <View style={styles.keepScreenRow}>
              <Text style={styles.keepScreenLabel}>{t('settings.textSize')}</Text>
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
                      accessibilityLabel={`${t('settings.textSize')} ${i + 1}`}
                    >
                      <View style={[styles.fontSizeDot, fontSizeIndex === i && styles.fontSizeDotActive]} />
                    </Pressable>
                  ))}
                </View>
                <Ionicons name="text" size={20} color={colors.secondaryLabel} />
              </View>
            </View>
          </View>

          {recipe.notes ? (
            <View style={styles.notesBlock}>
              <Text style={styles.sectionLabel}>{t('recipes.notes')}</Text>
              <Text style={[styles.notesText, { fontSize: FONT_SIZES[fontSizeIndex], lineHeight: LINE_HEIGHTS[fontSizeIndex] }]}>{recipe.notes}</Text>
            </View>
          ) : null}

          {recipe.components.map((component, i) => (
            <ComponentSection
              key={i}
              component={component}
              index={i}
              recipe={recipe}
              addMode={addMode}
              showStepQty={showStepQty}
              sessionAdded={sessionAdded}
              onAdd={handleAddIngredient}
              onAddAll={handleAddAll}
              fontSize={FONT_SIZES[fontSizeIndex]}
              lineHeight={LINE_HEIGHTS[fontSizeIndex]}
            />
          ))}
        </View>
      </ScrollView>
      <AddToMealPlanSheet ref={mealPlanSheetRef} recipeId={recipe.id} />
      <AddIngredientToShoppingListSheet ref={addIngredientSheetRef} onConfirm={handleConfirmAddIngredient} />
    </View>
  )
}

export default ReadView
