export interface IngredientActions {
  addMode: boolean
  sessionAdded: Set<string>
  checkedIngredients: Set<string>
  onToggleIngredient: (key: string) => void
  onReplaceIngredient: (componentIndex: number, ingredientIndex: number) => void
  onRestoreIngredient: (componentIndex: number, ingredientIndex: number) => void
  onAddIngredient: (componentIndex: number, ingredientIndex: number) => void
  onAddAllIngredients: (componentIndex: number) => void
  onAddAllUnifiedIngredients: () => void
}
