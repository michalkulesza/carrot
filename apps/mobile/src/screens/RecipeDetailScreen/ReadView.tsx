import type { RefObject } from 'react'
import { ActivityIndicator, Linking, Pressable, ScrollView, Switch, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { useTranslation } from 'react-i18next'
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
import { extractDisplayUrl, FONT_SIZES, LINE_HEIGHTS } from './helpers'
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
  handleFontSizeChange,
  handleAddIngredient,
  handleAddAll,
  handleConfirmAddIngredient,
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
  handleFontSizeChange: (index: number) => void
  handleAddIngredient: (key: string, text: string) => void
  handleAddAll: (keys: string[], texts: string[]) => void
  handleConfirmAddIngredient: (text: string) => void
  mealPlanSheetRef: RefObject<AddToMealPlanSheetHandle | null>
  addIngredientSheetRef: RefObject<AddIngredientToShoppingListSheetHandle | null>
}) => {
  const { t } = useTranslation()
  const hasImage = !!recipe.thumbnail_url

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
        contentInsetAdjustmentBehavior="never"
      >
        {hasImage && !heroImageErrored ? (
          <Image
            source={{ uri: proxyThumbnailUrl(recipe.thumbnail_url!)! }}
            style={styles.heroImage}
            accessibilityLabel={recipe.title}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={recipe.thumbnail_url}
            onError={() => setHeroImageErrored(true)}
          />
        ) : hasImage && heroImageErrored && PLACEHOLDER_URL ? (
          <Image
            source={{ uri: PLACEHOLDER_URL }}
            style={styles.heroImage}
            accessibilityLabel={recipe.title}
            contentFit="cover"
          />
        ) : (
          <View style={{ height: insets.top + 56 }} />
        )}

        <View style={styles.card}>
          <Text style={styles.title}>{recipe.title}</Text>

          {recipe.tags.length > 0 && (
            <View style={styles.tagRow}>
              {recipe.tags.map((tag) => (
                <View key={tag.id} style={styles.tag}>
                  <Text style={styles.tagText}>{tTag(tag.name, t)}</Text>
                </View>
              ))}
            </View>
          )}

          <NutritionBoxGrid
            editing={false}
            items={[
              { label: t('recipes.serves'), value: recipe.servings?.toString() ?? '', accessibilityLabel: t('recipes.serves') },
              { label: t('recipes.colKcal'), value: recipe.kcal_per_serving?.toString() ?? '', accessibilityLabel: t('recipes.kcalPerServing') },
              { label: t('recipes.protein'), value: recipe.protein_per_serving?.toString() ?? '', accessibilityLabel: t('recipes.proteinPerServing') },
              { label: t('recipes.fat'), value: recipe.fat_per_serving?.toString() ?? '', accessibilityLabel: t('recipes.fatPerServing') },
              { label: t('recipes.carbs'), value: recipe.carbs_per_serving?.toString() ?? '', accessibilityLabel: t('recipes.carbsPerServing') },
            ]}
            disclaimerText={t('recipes.nutritionEstimateDisclaimer')}
          />

          {recipe.source_url ? (
            <Pressable
              onPress={() => void Linking.openURL(recipe.source_url!)}
              style={({ pressed }) => [styles.sourceRow, pressed && { opacity: 0.7 }]}
              accessibilityLabel={t('recipes.source')}
              accessibilityRole="link"
            >
              <Feather name="link" size={13} color={colors.blue} style={styles.sourceIcon} />
              <Text style={styles.sourceText} numberOfLines={1}>
                {extractDisplayUrl(recipe.source_url)}
              </Text>
            </Pressable>
          ) : null}

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
              <Text style={styles.keepScreenLabel}>{t('settings.keepScreenOnDefault')}</Text>
              <Switch
                value={keepScreenOn}
                onValueChange={handleToggleKeepScreenOn}
                accessibilityLabel={t('settings.keepScreenOnDefault')}
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
