import { useState } from 'react'
import { ExternalLink } from 'react-feather'
import { useTranslation } from 'react-i18next'
import type { Tag } from '@carrot/shared/types'
import TagRow from '../TagRow'
import EditLine from './EditLine'
import RecipeComponentSection from './RecipeComponentSection'
import RecipeMacroPills from './RecipeMacroPills'
import ThumbnailPicker from './ThumbnailPicker'
import {
  currentUsername,
  parseIngredient,
  serializeIngredient,
  type EditableRecipe,
  type StructuredIngredient,
} from './helpers'

interface EditableRecipeViewProps {
  recipe: EditableRecipe
  recipeId: string
  selectedTags: Tag[]
  allTags: Tag[]
  activeAllergens: string[]
  onChange: (r: EditableRecipe) => void
  onTagAdd: (tag: Tag) => void
  onTagRemove: (tagId: string) => void
  onTagCreate: (name: string) => Promise<Tag>
}

const EditableRecipeView = ({
  recipe,
  recipeId,
  selectedTags,
  allTags,
  activeAllergens,
  onChange,
  onTagAdd,
  onTagRemove,
  onTagCreate,
}: EditableRecipeViewProps) => {
  const { t } = useTranslation()
  const [isAdapted, setIsAdapted] = useState(false)

  const setTitle = (title: string) => onChange({ ...recipe, title })
  const setServings = (servings: string) => onChange({ ...recipe, servings })
  const setKcal = (kcal: string) => onChange({ ...recipe, kcal })
  const setProtein = (protein: string) => onChange({ ...recipe, protein })
  const setFat = (fat: string) => onChange({ ...recipe, fat })
  const setCarbs = (carbs: string) => onChange({ ...recipe, carbs })

  const setIngredient = (ci: number, ii: number, val: StructuredIngredient) => {
    setIsAdapted(true)
    const components = recipe.components.map((c, ci2) =>
      ci2 !== ci
        ? c
        : {
            ...c,
            ingredients: c.ingredients.map((ing, ii2) =>
              ii2 === ii ? val : ing
            ),
          }
    )
    onChange({ ...recipe, components })
  }

  const handleReplace = (ci: number, ii: number) => {
    const comp = recipe.components[ci]
    const flag = comp.ingredient_flags[ii]
    if (!flag?.substitute) return
    const originalDisplay = serializeIngredient(comp.ingredients[ii])
    const newIngredients = comp.ingredients.map((ing, idx) =>
      idx === ii ? parseIngredient(flag.substitute!) : ing
    )
    const newFlags = comp.ingredient_flags.map((f, idx) =>
      idx === ii
        ? { ...f!, substitute_applied: true, original_display: originalDisplay }
        : f
    )
    const components = recipe.components.map((c, ci2) =>
      ci2 !== ci
        ? c
        : { ...c, ingredients: newIngredients, ingredient_flags: newFlags }
    )
    onChange({ ...recipe, components })
  }

  const handleRestore = (ci: number, ii: number) => {
    const comp = recipe.components[ci]
    const flag = comp.ingredient_flags[ii]
    if (!flag?.original_display) return
    const newIngredients = comp.ingredients.map((ing, idx) =>
      idx === ii ? parseIngredient(flag.original_display!) : ing
    )
    const newFlags = comp.ingredient_flags.map((f, idx) =>
      idx === ii
        ? { ...f!, substitute_applied: false, original_display: null }
        : f
    )
    const components = recipe.components.map((c, ci2) =>
      ci2 !== ci
        ? c
        : { ...c, ingredients: newIngredients, ingredient_flags: newFlags }
    )
    onChange({ ...recipe, components })
  }

  const setStep = (ci: number, si: number, val: string) => {
    setIsAdapted(true)
    const components = recipe.components.map((c, ci2) =>
      ci2 !== ci
        ? c
        : {
            ...c,
            steps: c.steps.map((s, si2) => (si2 === si ? val : s)),
          }
    )
    onChange({ ...recipe, components })
  }

  const handleThumbnailUploaded = (url: string) =>
    onChange({ ...recipe, thumbnail_url: url })

  const originalHandle = recipe.creator_handle
  const myHandle = currentUsername()

  return (
    <div className="mt-4 border-t border-zinc-200 pt-4">
      <div className="flex gap-3 items-start mb-2">
        <ThumbnailPicker
          recipeId={recipeId}
          thumbnailUrl={recipe.thumbnail_url}
          onUploaded={handleThumbnailUploaded}
        />
        <div className="flex-1 min-w-0">
          <EditLine
            value={recipe.title}
            onChange={setTitle}
            className="text-lg font-bold leading-snug"
            multiline
          />
        </div>
      </div>

      <div className="mb-3">
        <TagRow
          tags={selectedTags}
          allTags={allTags}
          onAdd={onTagAdd}
          onRemove={onTagRemove}
          onCreateTag={onTagCreate}
        />
      </div>

      <div className="flex flex-col gap-2 mb-4">
        {(originalHandle || recipe.source_url) && (
          <div className="flex flex-wrap gap-2">
            {originalHandle && (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full bg-zinc-100 text-zinc-500">
                {t('addRecipe.by', { handle: originalHandle })}
              </span>
            )}
            {recipe.source_url && (
              <a
                href={recipe.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 transition-colors"
              >
                <ExternalLink className="w-3 h-3 shrink-0" />
                {t('recipes.source')}
              </a>
            )}
            {isAdapted && (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full bg-success/10 text-success-700 animate-appearance-in">
                ✎ {t('addRecipe.adaptedBy', { handle: myHandle })}
              </span>
            )}
          </div>
        )}
        <RecipeMacroPills
          recipe={recipe}
          setServings={setServings}
          setKcal={setKcal}
          setProtein={setProtein}
          setFat={setFat}
          setCarbs={setCarbs}
        />
      </div>

      {recipe.components.map((comp, ci) => (
        <RecipeComponentSection
          key={ci}
          component={comp}
          showName={recipe.components.length > 1}
          activeAllergens={activeAllergens}
          onIngredientChange={(ii, val) => setIngredient(ci, ii, val)}
          onStepChange={(si, val) => setStep(ci, si, val)}
          onAllergenReplace={(ii) => handleReplace(ci, ii)}
          onAllergenRestore={(ii) => handleRestore(ci, ii)}
        />
      ))}
    </div>
  )
}

export default EditableRecipeView
