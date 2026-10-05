import type { RecipeOut, SaveComponent } from '@carrot/shared/types'
import type { IngredientActions } from './ingredientActions'
import type { Mode } from './helpers'
import EditComponent from './EditComponent'
import UnifiedIngredientList from './UnifiedIngredientList'
import ViewComponent from './ViewComponent'

interface RecipeComponentColumnProps {
  recipe: RecipeOut
  components: SaveComponent[]
  mode: Mode
  unitSystem: string
  servingScale: number
  activeAllergens: string[]
  fontSizeIndex: number
  ingredientActions: IngredientActions
  onIngredientChange: (ci: number, ii: number, value: string) => void
  onStepChange: (ci: number, si: number, value: string) => void
}

const RecipeComponentColumn = ({
  recipe,
  components,
  mode,
  unitSystem,
  servingScale,
  activeAllergens,
  fontSizeIndex,
  ingredientActions,
  onIngredientChange,
  onStepChange,
}: RecipeComponentColumnProps) => {
  const single = components.length === 1
  const hasMultipleIngredientGroups =
    components.filter((component) => component.ingredients.length > 0).length >
    1

  if (mode === 'editing')
    return components.map((comp, ci) => (
      <EditComponent
        key={ci}
        comp={comp}
        single={single}
        onIngredientChange={(ii, val) => onIngredientChange(ci, ii, val)}
        onStepChange={(si, val) => onStepChange(ci, si, val)}
      />
    ))

  return (
    <>
      {components.length > 0 && (
        <UnifiedIngredientList
          key={`${recipe.id}-${hasMultipleIngredientGroups}`}
          components={components}
          collapsible={hasMultipleIngredientGroups}
          unitSystem={unitSystem}
          servingScale={servingScale}
          activeAllergens={activeAllergens}
          addMode={ingredientActions.addMode}
          sessionAdded={ingredientActions.sessionAdded}
          checkedIngredients={ingredientActions.checkedIngredients}
          onToggleIngredient={ingredientActions.onToggleIngredient}
          onReplaceIngredient={ingredientActions.onReplaceIngredient}
          onRestoreIngredient={ingredientActions.onRestoreIngredient}
          onAddIngredient={ingredientActions.onAddIngredient}
          onAddAllIngredients={ingredientActions.onAddAllUnifiedIngredients}
          fontSizeIndex={fontSizeIndex}
        />
      )}
      {components.map((comp, ci) => (
        <ViewComponent
          key={`${recipe.id}-${ci}`}
          comp={comp}
          unitSystem={unitSystem}
          single={single}
          activeAllergens={activeAllergens}
          onReplaceIngredient={(ii) =>
            ingredientActions.onReplaceIngredient(ci, ii)
          }
          onRestoreIngredient={(ii) =>
            ingredientActions.onRestoreIngredient(ci, ii)
          }
          recipeId={recipe.id}
          recipeTitle={recipe.title}
          componentIndex={ci}
          addMode={ingredientActions.addMode}
          sessionAdded={ingredientActions.sessionAdded}
          checkedIngredients={ingredientActions.checkedIngredients}
          onToggleIngredient={ingredientActions.onToggleIngredient}
          onAddIngredient={(ii) => ingredientActions.onAddIngredient(ci, ii)}
          onAddAllIngredients={() => ingredientActions.onAddAllIngredients(ci)}
          fontSizeIndex={fontSizeIndex}
          servingScale={servingScale}
          collapsible={
            hasMultipleIngredientGroups && comp.ingredients.length > 0
          }
          showIngredients={hasMultipleIngredientGroups}
          showGroupHeader={components.length > 1}
        />
      ))}
    </>
  )
}

export default RecipeComponentColumn
