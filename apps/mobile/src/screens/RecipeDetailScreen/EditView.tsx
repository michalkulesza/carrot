import { MAX_SERVINGS, MIN_SERVINGS } from '@carrot/shared/utils/servings'
import { useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native'
import type { EdgeInsets } from 'react-native-safe-area-context'
import type { RecipeOut, ShoppingCategory } from '@carrot/shared/types'
import type { StructuredIngredient } from '@carrot/shared/utils/ingredientUtils'
import DeleteRecipeButton from './DeleteRecipeButton'
import EditHero from './EditHero'
import EditIngredientsSection from './EditIngredientsSection'
import EditStatsGrid from './EditStatsGrid'
import EditStepsSection from './EditStepsSection'
import EditTitleBlock from './EditTitleBlock'
import { isIngredientEmpty, type EditDraft } from './helpers'
import IngredientEditSheet from './IngredientEditSheet'
import NotesSection from './NotesSection'
import RelatedRecipesSection from './RelatedRecipesSection'
import ServesCookRow from './ServesCookRow'
import StepEditSheet from './StepEditSheet'
import TagsSection from './TagsSection'
import { styles } from './styles'
import type { useEditDraft } from './useEditDraft'
import { ScrollIntoViewContext } from './ScrollIntoViewContext'
import { useItemSheetTarget } from './useItemSheetTarget'
import { KEYBOARD_SCROLL_EVENT_THROTTLE, useKeyboardScroll } from './useKeyboardScroll'

type EditDraftState = ReturnType<typeof useEditDraft>

type EditViewProps = {
  recipe: RecipeOut
  draft: EditDraft
  saving: boolean
  insets: EdgeInsets
  onDeleteRecipe: () => void
} & Pick<
  EditDraftState,
  | 'handlePickThumbnail'
  | 'handleNutritionChange'
  | 'handleServingsChange'
  | 'updateComp'
  | 'setIngredient'
  | 'addIngredient'
  | 'setIngredientCategory'
  | 'removeIngredient'
  | 'setStep'
  | 'addStep'
  | 'removeStep'
  | 'setDraft'
  | 'setThumbErrored'
  | 'uploadingThumb'
  | 'thumbErrored'
>

const KEYBOARD_BEHAVIOR = Platform.OS === 'ios' ? 'padding' : 'height'

const EditView = ({
  recipe,
  draft,
  saving,
  insets,
  onDeleteRecipe,
  handlePickThumbnail,
  handleNutritionChange,
  handleServingsChange,
  updateComp,
  setIngredient,
  setIngredientCategory,
  addIngredient,
  removeIngredient,
  setStep,
  addStep,
  removeStep,
  setDraft,
  setThumbErrored,
  uploadingThumb,
  thumbErrored,
}: EditViewProps) => {
  const draftRef = useRef(draft)

  useLayoutEffect(() => {
    draftRef.current = draft
  }, [draft])

  const getIngredientCount = useCallback((ci: number) => draftRef.current.components[ci].ingredients.length, [])
  const isIngredientBlank = useCallback((ci: number, ii: number) => {
    const ingredient = draftRef.current.components[ci]?.ingredients[ii]

    return !!ingredient && isIngredientEmpty(ingredient)
  }, [])

  const getStepCount = useCallback((ci: number) => draftRef.current.components[ci].steps.length, [])
  const isStepBlank = useCallback((ci: number, si: number) => {
    const step = draftRef.current.components[ci]?.steps[si]

    return step !== undefined && step.trim() === ''
  }, [])

  const ingredientSheet = useItemSheetTarget({
    getCount: getIngredientCount,
    isEmpty: isIngredientBlank,
    add: addIngredient,
    remove: removeIngredient,
  })
  const stepSheet = useItemSheetTarget({
    getCount: getStepCount,
    isEmpty: isStepBlank,
    add: addStep,
    remove: removeStep,
  })

  const ingredientTarget = ingredientSheet.target
  const ingredientComponent = ingredientTarget ? draft.components[ingredientTarget.ci] : undefined
  const sheetIngredient = ingredientTarget ? ingredientComponent?.ingredients[ingredientTarget.ii] ?? null : null
  const sheetCategory = ingredientTarget
    ? ingredientComponent?.shopping_list_categories[ingredientTarget.ii] ?? 'other'
    : 'other'
  const canRemoveIngredient = (ingredientComponent?.ingredients.length ?? 0) > 1

  const stepTarget = stepSheet.target
  const stepComponent = stepTarget ? draft.components[stepTarget.ci] : undefined
  const sheetStep = stepTarget ? stepComponent?.steps[stepTarget.ii] ?? null : null
  const canRemoveStep = (stepComponent?.steps.length ?? 0) > 1

  const servings = Number(draft.servings) || 0
  const { totalTimeMinutes, kcal, protein, fat, carbs } = draft
  const nutritionValues = useMemo(
    () => ({ totalTimeMinutes, kcal, protein, fat, carbs }),
    [totalTimeMinutes, kcal, protein, fat, carbs],
  )

  const handleTitleChange = useCallback(
    (title: string) => setDraft((prev) => prev && { ...prev, title }),
    [setDraft],
  )

  const handleGroupNameChange = useCallback(
    (ci: number, name: string) => updateComp(ci, { name }),
    [updateComp],
  )

  const handleDecreaseServings = useCallback(
    () => handleServingsChange(Math.max(MIN_SERVINGS, servings - 1)),
    [handleServingsChange, servings],
  )
  const handleIncreaseServings = useCallback(
    () => handleServingsChange(Math.min(MAX_SERVINGS, servings + 1)),
    [handleServingsChange, servings],
  )

  const handleSheetIngredientChange = useCallback(
    (ingredient: StructuredIngredient) => {
      if (ingredientTarget) setIngredient(ingredientTarget.ci, ingredientTarget.ii, ingredient)
    },
    [ingredientTarget, setIngredient],
  )

  const handleSheetCategoryChange = useCallback(
    (category: ShoppingCategory) => {
      if (ingredientTarget) setIngredientCategory(ingredientTarget.ci, ingredientTarget.ii, category)
    },
    [ingredientTarget, setIngredientCategory],
  )

  const handleSheetStepChange = useCallback(
    (value: string) => {
      if (stepTarget) setStep(stepTarget.ci, stepTarget.ii, value)
    },
    [stepTarget, setStep],
  )

  const keyboardScroll = useKeyboardScroll()
  const scrollContentStyle = { paddingBottom: 40 + insets.bottom }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={KEYBOARD_BEHAVIOR}>
      <ScrollView
        ref={keyboardScroll.scrollRef}
        style={styles.scroll}
        contentContainerStyle={scrollContentStyle}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScroll={keyboardScroll.handleScroll}
        onTouchStart={keyboardScroll.handleTouchStart}
        scrollEventThrottle={KEYBOARD_SCROLL_EVENT_THROTTLE}
      >
        <EditHero
          title={draft.title}
          thumbnailUrl={draft.thumbnail_url}
          topInset={insets.top}
          errored={thumbErrored}
          uploading={uploadingThumb}
          onError={setThumbErrored}
          onPickThumbnail={handlePickThumbnail}
        />

        <View style={styles.titleBlock}>
          <EditTitleBlock
            recipe={recipe}
            title={draft.title}
            onTitleChange={handleTitleChange}
            onDeleteRecipe={onDeleteRecipe}
          />
          <TagsSection recipe={recipe} editing />
          <EditStatsGrid values={nutritionValues} onChange={handleNutritionChange} />
          <ServesCookRow
            servings={servings}
            onDecreaseServings={handleDecreaseServings}
            onIncreaseServings={handleIncreaseServings}
          />
        </View>

        <EditIngredientsSection
          components={draft.components}
          onNameChange={handleGroupNameChange}
          onOpenIngredient={ingredientSheet.open}
          onAddIngredient={ingredientSheet.addAndOpen}
        />
        <EditStepsSection
          components={draft.components}
          onOpenStep={stepSheet.open}
          onAddStep={stepSheet.addAndOpen}
        />
        <ScrollIntoViewContext.Provider value={keyboardScroll.actions}>
          <NotesSection recipe={recipe} />
        </ScrollIntoViewContext.Provider>
        <RelatedRecipesSection recipeId={recipe.id} editing />
        <View style={styles.editFooter}>
          <DeleteRecipeButton disabled={saving} onPress={onDeleteRecipe} />
        </View>
      </ScrollView>

      <IngredientEditSheet
        visible={ingredientTarget !== null}
        ingredient={sheetIngredient}
        category={sheetCategory}
        canRemove={canRemoveIngredient}
        onChange={handleSheetIngredientChange}
        onCategoryChange={handleSheetCategoryChange}
        onRemove={ingredientSheet.handleRemove}
        onDismiss={ingredientSheet.handleDismiss}
      />
      <StepEditSheet
        visible={stepTarget !== null}
        step={sheetStep}
        canRemove={canRemoveStep}
        onChange={handleSheetStepChange}
        onRemove={stepSheet.handleRemove}
        onDismiss={stepSheet.handleDismiss}
      />
    </KeyboardAvoidingView>
  )
}

export default EditView
