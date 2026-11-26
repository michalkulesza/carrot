import { useMemo, type RefObject } from 'react'
import { Keyboard, ScrollView, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { EdgeInsets } from 'react-native-safe-area-context'
import type { RecipeIssueCode, RecipeOut } from '@carrot/shared/types'
import AddToMealPlanSheet, { type AddToMealPlanSheetHandle } from '../../components/AddToMealPlanSheet'
import FadeSection from './FadeSection'
import GroceryAddedToast from './GroceryAddedToast'
import GroceryModeBar from './GroceryModeBar'
import { getGroceryBarClearance } from './groceryLayout'
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
import { buildIngredientGroups } from './helpers'
import { styles } from './styles'
import { useGroceryMode } from './useGroceryMode'

interface ReadViewProps {
  recipe: RecipeOut
  activeAllergens: string[]
  selectedServings: number | null
  unitSystem: string
  fontSizeIndex: number
  keepScreenOn: boolean
  insets: EdgeInsets
  heroImageErrored: boolean
  setHeroImageErrored: (errored: boolean) => void
  handleToggleKeepScreenOn: (val: boolean) => void
  handleFontSizeChange: (index: number) => void
  handleToggleFavourite: () => void
  handleDecreaseServings: () => void
  handleIncreaseServings: () => void
  onOpenCookMode: () => void
  onDismissIssue: (issueCode: RecipeIssueCode) => Promise<void>
  onDeleteRecipe: () => void
  mealPlanSheetRef: RefObject<AddToMealPlanSheetHandle | null>
}

const ReadView = ({
  recipe,
  activeAllergens,
  selectedServings,
  unitSystem,
  fontSizeIndex,
  keepScreenOn,
  insets,
  heroImageErrored,
  setHeroImageErrored,
  handleToggleKeepScreenOn,
  handleFontSizeChange,
  handleToggleFavourite,
  handleDecreaseServings,
  handleIncreaseServings,
  onOpenCookMode,
  onDismissIssue,
  onDeleteRecipe,
  mealPlanSheetRef,
}: ReadViewProps) => {
  const { t } = useTranslation()
  const hasScalableServings = recipe.servings !== null && recipe.servings > 0
  const hasSteps = recipe.components.some((component) => component.steps.length > 0)
  const servingScale = recipe.servings && selectedServings ? selectedServings / recipe.servings : 1
  const visibleServings = hasScalableServings ? selectedServings : null

  const cupUnit = t('units.cup', { defaultValue: 'cup' })
  const groups = useMemo(
    () => buildIngredientGroups(recipe.components, unitSystem, servingScale, cupUnit),
    [recipe.components, unitSystem, servingScale, cupUnit],
  )
  const entries = useMemo(() => groups.flatMap((group) => group.entries), [groups])
  const groceryMode = useGroceryMode(entries)

  const scrollBottomPadding = groceryMode.active ? getGroceryBarClearance(insets.bottom) : insets.bottom
  const scrollContentStyle = { paddingBottom: scrollBottomPadding }

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
            groups={groups}
            entries={entries}
            groceryMode={groceryMode.active}
            selectedKeys={groceryMode.selectedKeys}
            allSelected={groceryMode.allSelected}
            onToggleSelected={groceryMode.handleToggle}
            onToggleAll={groceryMode.handleToggleAll}
            onEnterGroceryMode={groceryMode.handleEnter}
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
      <GroceryModeBar
        active={groceryMode.active}
        count={groceryMode.selectedCount}
        onCancel={groceryMode.handleCancel}
        onConfirm={groceryMode.handleConfirm}
      />
      {groceryMode.toastCount !== null ? (
        <GroceryAddedToast count={groceryMode.toastCount} onUndo={groceryMode.handleUndo} />
      ) : null}
    </View>
  )
}

export default ReadView
