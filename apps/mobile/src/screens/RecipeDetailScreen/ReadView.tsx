import { useState, type RefObject } from 'react'
import { ActivityIndicator, Linking, Pressable, ScrollView, Switch, Text, View } from 'react-native'
import Avatar from '../../components/Avatar'
import NetworkImage from '../../components/NetworkImage'
import { useTranslation } from 'react-i18next'
import { useHousehold } from '../../context/HouseholdContext'
import { useAuth } from '../../context/AuthContext'
import { Feather, Ionicons } from '@expo/vector-icons'
import type { EdgeInsets } from 'react-native-safe-area-context'
import type { RecipeOut } from '@carrot/shared/types'
import AddToMealPlanSheet, { type AddToMealPlanSheetHandle } from '../../components/AddToMealPlanSheet'
import AddIngredientToShoppingListSheet, {
  type AddIngredientToShoppingListSheetHandle,
} from '../../components/AddIngredientToShoppingListSheet'
import NutritionBoxGrid, { TooltipPopover } from '../../components/NutritionBoxGrid'
import { colors } from '../../theme/colors'
import { proxyThumbnailUrl, PLACEHOLDER_URL } from '../../api/thumbnailUrl'
import { styles } from './styles'
import { FONT_SIZES, LINE_HEIGHTS } from './helpers'
import ComponentSection from './ComponentSection'
import UnifiedIngredientsSection from './UnifiedIngredientsSection'
import NotesSection from './NotesSection'
import TagsSection from './TagsSection'
import ServingStepper from './ServingStepper'

const formatCookingTime = (minutes: number | null, t: (key: string) => string) => {
  if (minutes === null) return ''
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (hours === 0) return `${minutes}${t('recipes.minutesShort')}`
  if (remainingMinutes === 0) return `${hours}${t('recipes.hoursShort')}`
  return `${hours}${t('recipes.hoursShort')}${remainingMinutes}${t('recipes.minutesShort')}`
}

const ReadView = ({
  recipe,
  selectedServings,
  addMode,
  showStepQty,
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
  mealPlanSheetRef,
  addIngredientSheetRef,
}: {
  recipe: RecipeOut
  selectedServings: number | null
  addMode: boolean
  showStepQty: boolean
  unitSystem: string
  sessionAdded: Set<string>
  fontSizeIndex: number
  keepScreenOn: boolean
  insets: EdgeInsets
  heroImageErrored: boolean
  setHeroImageErrored: (errored: boolean) => void
  handleToggleKeepScreenOn: (val: boolean) => void
  handleFontSizeChange: (index: number) => void
  handleAddIngredient: (key: string, text: string) => void
  handleAddAll: (keys: string[], texts: string[]) => void
  handleConfirmAddIngredient: (text: string) => void
  handleToggleFavourite: () => void
  handleDecreaseServings: () => void
  handleIncreaseServings: () => void
  mealPlanSheetRef: RefObject<AddToMealPlanSheetHandle | null>
  addIngredientSheetRef: RefObject<AddIngredientToShoppingListSheetHandle | null>
}) => {
  const { t } = useTranslation()
  const { households } = useHousehold()
  const { user } = useAuth()
  const hasImage = !!recipe.thumbnail_url
  const hasScalableServings = recipe.servings !== null && recipe.servings > 0
  const personalName = user?.nickname || user?.email || t('households.personal')
  const contributorName = recipe.household_id ? recipe.added_by ?? personalName : personalName
  const contributorTooltip = recipe.added_by ?? t('households.personalHousehold')
  const [openHouseholdAvatar, setOpenHouseholdAvatar] = useState<string | null>(null)
  const servingScale = recipe.servings && selectedServings
    ? selectedServings / recipe.servings
    : 1
  const recipeHousehold = recipe.household_id ? households.find((h) => h.id === recipe.household_id) : undefined
  const householdAvatars = [
    ...(!recipe.household_id || recipe.shared_to_personal
      ? [{ key: 'personal', name: contributorName, tooltip: contributorTooltip }]
      : []),
    ...(recipeHousehold
      ? [{ key: recipeHousehold.id, name: recipeHousehold.name, color: recipeHousehold.color, tooltip: recipeHousehold.name }]
      : []),
  ]

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

          <TagsSection recipe={recipe} editing={false} />

          <NutritionBoxGrid
            editing={false}
            items={[
              { label: t('recipes.totalTime'), value: formatCookingTime(recipe.total_time_minutes, t), accessibilityLabel: t('recipes.totalTime'), showDisclaimer: false },
              { label: t('recipes.colKcal'), value: recipe.kcal_per_serving?.toString() ?? '', accessibilityLabel: t('recipes.kcalPerServing') },
              { label: t('recipes.protein'), value: recipe.protein_per_serving?.toString() ?? '', accessibilityLabel: t('recipes.proteinPerServing'), unit: 'g' },
              { label: t('recipes.fat'), value: recipe.fat_per_serving?.toString() ?? '', accessibilityLabel: t('recipes.fatPerServing'), unit: 'g' },
              { label: t('recipes.carbs'), value: recipe.carbs_per_serving?.toString() ?? '', accessibilityLabel: t('recipes.carbsPerServing'), unit: 'g' },
            ]}
            disclaimerText={t('recipes.nutritionEstimateDisclaimer')}
          />

          {hasScalableServings && selectedServings !== null && (
            <ServingStepper
              servings={selectedServings}
              onDecrease={handleDecreaseServings}
              onIncrease={handleIncreaseServings}
            />
          )}

          <View style={styles.householdRow}>
            {householdAvatars.map(({ key, tooltip, ...avatarProps }) => (
              <View key={key} style={styles.householdAvatarWrapper}>
                <Pressable
                  onPress={() => setOpenHouseholdAvatar((current) => (current === key ? null : key))}
                  accessibilityLabel={tooltip}
                  accessibilityRole="button"
                >
                  <Avatar {...avatarProps} size={28} />
                </Pressable>
                {openHouseholdAvatar === key && (
                  <TooltipPopover
                    text={tooltip}
                    alignRight={false}
                    fitContent
                    onDismiss={() => setOpenHouseholdAvatar(null)}
                  />
                )}
              </View>
            ))}
          </View>

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
              showStepQty={showStepQty}
              unitSystem={unitSystem}
              servingScale={servingScale}
              sessionAdded={sessionAdded}
              onAdd={handleAddIngredient}
              onAddAll={handleAddAll}
              fontSize={FONT_SIZES[fontSizeIndex]}
              lineHeight={LINE_HEIGHTS[fontSizeIndex]}
              collapsible={recipe.components.length > 1 && i > 0}
              showIngredients={recipe.components.length > 1}
              showGroupHeader={recipe.components.length > 1}
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
