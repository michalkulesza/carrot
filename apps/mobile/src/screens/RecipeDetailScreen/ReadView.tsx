import { useMemo, type RefObject } from 'react'
import { ScrollView, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { EdgeInsets } from 'react-native-safe-area-context'
import type { RecipeIssueCode, RecipeOut } from '@carrot/shared/types'
import AddToMealPlanSheet, { type AddToMealPlanSheetHandle } from '../../components/AddToMealPlanSheet'
import FadeSection from './FadeSection'
import GroceryModeBar from './GroceryModeBar'
import { getGroceryBarClearance } from './groceryLayout'
import HeroImage from './HeroImage'
import { IngredientSwapActionsContext } from './IngredientSwapContext'
import { ScrollIntoViewContext } from './ScrollIntoViewContext'
import IngredientSwapSheet from './IngredientSwapSheet'
import IngredientsSection from './IngredientsSection'
import NotesSection from './NotesSection'
import AllergenSummaryBox from './AllergenSummaryBox'
import NutritionStrip from './NutritionStrip'
import ReadingPrefsCard from './ReadingPrefsCard'
import RecipeIssueBanner from './RecipeIssueBanner'
import RelatedRecipesSection from './RelatedRecipesSection'
import ScreenToast from './ScreenToast'
import ServesCookRow from './ServesCookRow'
import StepsSection from './StepsSection'
import TagsSection from './TagsSection'
import TitleBlock from './TitleBlock'
import { buildIngredientGroups } from './helpers'
import { styles } from './styles'
import { useGroceryMode } from './useGroceryMode'
import { useIngredientSwap } from './useIngredientSwap'
import { KEYBOARD_SCROLL_EVENT_THROTTLE, useKeyboardScroll } from './useKeyboardScroll'

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
  onRecipeRemoved: () => void
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
  onRecipeRemoved,
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
  const swap = useIngredientSwap({ recipe, entries, activeAllergens, servingScale, onRecipeRemoved })
  const keyboardScroll = useKeyboardScroll()

  const toastMessage =
    groceryMode.toastCount !== null ? t('recipes.addedItemsToast', { count: groceryMode.toastCount }) : null

  const scrollBottomPadding = groceryMode.active ? getGroceryBarClearance(insets.bottom) : insets.bottom
  const scrollContentStyle = { paddingBottom: scrollBottomPadding }

  return (
    <View style={styles.container}>
      <ScrollView
        ref={keyboardScroll.scrollRef}
        style={styles.scroll}
        contentContainerStyle={scrollContentStyle}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        onScroll={keyboardScroll.handleScroll}
        onTouchStart={keyboardScroll.handleTouchStart}
        scrollEventThrottle={KEYBOARD_SCROLL_EVENT_THROTTLE}
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
          <IngredientSwapActionsContext.Provider value={swap.actions}>
            <IngredientsSection
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
              swapState={swap.state}
              selectedCount={groceryMode.selectedCount}
            />
          </IngredientSwapActionsContext.Provider>
        </FadeSection>
        <FadeSection>
          <StepsSection recipe={recipe} unitSystem={unitSystem} fontSizeIndex={fontSizeIndex} />
        </FadeSection>
        <FadeSection>
          <ScrollIntoViewContext.Provider value={keyboardScroll.actions}>
            <NotesSection recipe={recipe} />
          </ScrollIntoViewContext.Provider>
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
      <IngredientSwapSheet
        plan={swap.plan}
        onConfirm={swap.handleConfirmSwap}
        onDismiss={swap.handleDismissSheet}
      />
      {toastMessage !== null ? <ScreenToast message={toastMessage} onUndo={groceryMode.handleUndo} /> : null}
    </View>
  )
}

export default ReadView
