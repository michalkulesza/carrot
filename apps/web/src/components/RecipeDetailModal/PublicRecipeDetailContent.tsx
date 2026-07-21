import { useMemo, useState, type ReactNode } from 'react'
import type { PublicRecipeOut, RecipeOut, SaveComponent, Tag } from '@carrot/shared/types'
import { toEditState } from './helpers'
import RecipeHeroSection from './RecipeHeroSection'
import RecipeMetaBar from './RecipeMetaBar'
import UnifiedIngredientList from './UnifiedIngredientList'
import ViewComponent from './ViewComponent'

const toRecipe = (recipe: PublicRecipeOut, token: string): RecipeOut => ({
  ...recipe,
  id: token,
  protein_per_serving: 67,
  fat_per_serving: 67,
  carbs_per_serving: 67,
  creator_handle: null,
  notes: null,
  created_at: '',
  updated_at: '',
  household_id: null,
  shared_to_personal: true,
  added_by: null,
  is_favourite: false,
  tags: recipe.tags.map((tag, index): Tag => ({ ...tag, id: `${index}-${tag.name}`, is_default: false, household_id: null })),
})

const PublicRecipeDetailContent = ({ recipe, token, primaryAction, primaryActionContent }: { recipe: PublicRecipeOut; token: string; primaryAction?: { label: string; onClick: () => void; disabled: boolean }; primaryActionContent?: ReactNode }) => {
  const r = useMemo(() => toRecipe(recipe, token), [recipe, token])
  const draft = useMemo(() => toEditState(r), [r])
  const [servings, setServings] = useState(r.servings)
  const [fontSizeIndex, setFontSizeIndex] = useState(2)
  const [checkedIngredients, setCheckedIngredients] = useState<Set<string>>(new Set())
  const scale = r.servings && servings ? servings / r.servings : 1
  const components = r.components as SaveComponent[]
  const toggle = (key: string) => setCheckedIngredients(current => {
    const next = new Set(current)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })

  return <>
    <RecipeHeroSection recipe={r} draft={draft} mode="view" onTitleChange={() => {}} localTags={r.tags} allTags={[]} onTagAdd={() => {}} onTagRemove={() => {}} onTagCreate={async () => { throw new Error('Read only') }} fileInputRef={{ current: null }} onThumbnailFile={() => {}} imgUploading={false} addMode={false} onToggleAddMode={() => {}} onOpenMealPlan={() => {}} onToggleFavourite={() => {}} onEdit={() => {}} onDelete={() => {}} readOnly />
    <RecipeMetaBar recipe={r} draft={draft} mode="view" onNutritionChange={() => {}} wakeLockActive={false} onToggleWakeLock={() => {}} fontSizeIndex={fontSizeIndex} onFontSizeChange={setFontSizeIndex} onCancelMode={() => {}} selectedServings={servings} onDecreaseServings={() => setServings(value => value ? Math.max(1, value - 1) : value)} onIncreaseServings={() => setServings(value => value ? Math.min(99, value + 1) : value)} onOpenCookMode={() => {}} readOnly primaryAction={primaryAction} primaryActionContent={primaryActionContent} />
    <div className="mx-auto max-w-[800px] px-10 pb-5">
      <UnifiedIngredientList components={components} unitSystem="metric" servingScale={scale} activeAllergens={[]} addMode={false} sessionAdded={new Set()} checkedIngredients={checkedIngredients} onToggleIngredient={toggle} onReplaceIngredient={() => {}} onRestoreIngredient={() => {}} onAddIngredient={() => {}} onAddAllIngredients={() => {}} fontSizeIndex={fontSizeIndex} readOnly />
      {components.map((component, index) => <ViewComponent key={index} comp={component} unitSystem="metric" single={components.length === 1} activeAllergens={[]} onReplaceIngredient={() => {}} onRestoreIngredient={() => {}} recipeId={token} recipeTitle={r.title} componentIndex={index} checkedIngredients={checkedIngredients} onToggleIngredient={toggle} fontSizeIndex={fontSizeIndex} servingScale={scale} collapsible={components.length > 1 && index > 0} showIngredients={components.length > 1} showGroupHeader={components.length > 1} readOnly />)}
    </div>
  </>
}

export default PublicRecipeDetailContent
