import type { RefObject } from 'react'
import { Keyboard, ScrollView, View } from 'react-native'
import type { EdgeInsets } from 'react-native-safe-area-context'
import type { RecipeIssueCode, RecipeOut, ShoppingListItemInput } from '@carrot/shared/types'
import AddToMealPlanSheet, { type AddToMealPlanSheetHandle } from '../../components/AddToMealPlanSheet'
import AddIngredientToShoppingListSheet, {
  type AddIngredientToShoppingListSheetHandle,
} from '../../components/AddIngredientToShoppingListSheet'
import FadeSection from './FadeSection'
import HeroImage from './HeroImage'
import IngredientsSection from './IngredientsSection'
import NotesSection from './NotesSection'
import AllergenSummaryBox from './AllergenSummaryBox'
import NutritionStrip from './NutritionStrip'
import ReadingPrefsCard from './ReadingPrefsCard'
import RecipeIssueBanner from './RecipeIssueBanner'
import RelatedRecipesSection from './RelatedRecipesSection'
import ServesCookRow from './ServesCookRow'
import StepsSection from './StepsSection'
import TagsSection from './TagsSection'
import TitleBlock from './TitleBlock'
import { styles } from './styles'

interface ReadViewProps {
  recipe: RecipeOut
  activeAllergens: string[]
  selectedServings: number | null
  addMode: boolean
  unitSystem: string
  sessionAdded: Set<string>
  fontSizeIndex: number
  keepScreenOn: boolean
  insets: EdgeInsets
  heroImageErrored: boolean
  setHeroImageErrored: (errored: boolean) => void
  handleToggleKeepScreenOn: (val: boolean) => void
  handleFontSizeChange: (index: number) => void
  handleAddIngredient: (key: string, item: ShoppingListItemInput) => void
  handleAddAll: (keys: string[], items: ShoppingListItemInput[]) => void
  handleConfirmAddIngredient: (item: ShoppingListItemInput) => void
  handleToggleFavourite: () => void
  handleDecreaseServings: () => void
  handleIncreaseServings: () => void
  onOpenCookMode: () => void
  onDismissIssue: (issueCode: RecipeIssueCode) => Promise<void>
  onDeleteRecipe: () => void
  mealPlanSheetRef: RefObject<AddToMealPlanSheetHandle | null>
  addIngredientSheetRef: RefObject<AddIngredientToShoppingListSheetHandle | null>
}

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
}: ReadViewProps) => {
  const hasScalableServings = recipe.servings !== null && recipe.servings > 0
  const hasSteps = recipe.components.some((component) => component.steps.length > 0)
  const servingScale = recipe.servings && selectedServings ? selectedServings / recipe.servings : 1
  const visibleServings = hasScalableServings ? selectedServings : null
  const scrollContentStyle = { paddingBottom: insets.bottom }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={scrollContentStyle}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="never"
        onTouchStart={Keyboard.dismiss}
      >
        <HeroImage
          title={recipe.title}
          thumbnailUrl={recipe.thumbnail_url}
          topInset={insets.top}
          errored={heroImageErrored}
          onError={setHeroImageErrored}
        />

        <View style={styles.titleBlock}>
          <TitleBlock recipe={recipe} onToggleFavourite={handleToggleFavourite} onDeleteRecipe={onDeleteRecipe} />
          <TagsSection recipe={recipe} />
          <RecipeIssueBanner issueCodes={recipe.issue_codes ?? []} sourceUrl={recipe.source_url} onDismiss={onDismissIssue} />
          <AllergenSummaryBox
            components={recipe.components}
            activeAllergens={activeAllergens}
            uncertain={recipe.allergen_status === 'uncertain'}
          />
          <NutritionStrip recipe={recipe} />
          <ServesCookRow
            servings={visibleServings}
            hasSteps={hasSteps}
            onDecreaseServings={handleDecreaseServings}
            onIncreaseServings={handleIncreaseServings}
            onOpenCookMode={onOpenCookMode}
          />
          <ReadingPrefsCard
            keepScreenOn={keepScreenOn}
            fontSizeIndex={fontSizeIndex}
            onToggleKeepScreenOn={handleToggleKeepScreenOn}
            onFontSizeChange={handleFontSizeChange}
          />
        </View>

        <FadeSection>
          <IngredientsSection
            recipeId={recipe.id}
            components={recipe.components}
            unitSystem={unitSystem}
            servingScale={servingScale}
            addMode={addMode}
            sessionAdded={sessionAdded}
            onAdd={handleAddIngredient}
            onAddAll={handleAddAll}
            activeAllergens={activeAllergens}
            fontSizeIndex={fontSizeIndex}
          />
        </FadeSection>
        <FadeSection>
          <StepsSection recipe={recipe} unitSystem={unitSystem} fontSizeIndex={fontSizeIndex} />
        </FadeSection>
        <FadeSection>
          <NotesSection recipe={recipe} fontSizeIndex={fontSizeIndex} />
        </FadeSection>
        <FadeSection>
          <RelatedRecipesSection recipeId={recipe.id} />
        </FadeSection>
      </ScrollView>
      <AddToMealPlanSheet ref={mealPlanSheetRef} recipeId={recipe.id} />
      <AddIngredientToShoppingListSheet ref={addIngredientSheetRef} onConfirm={handleConfirmAddIngredient} />
    </View>
  )
}

export default ReadView
