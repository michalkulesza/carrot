export const UNITS = [
  'ml', 'l', 'tsp', 'tbsp', 'cup',
  'g', 'kg',
  'piece', 'clove', 'slice', 'can', 'bunch', 'pinch', 'sprig', 'handful',
] as const

export type Unit = typeof UNITS[number]

export interface AllergenData {
  predefined: string[]
  custom: string[]
}

export interface AllergenFlag {
  allergen: string | null
  substitute: string | null
  substitute_applied: boolean
  original_display: string | null
  ingredient_name?: string | null
}

export interface Ingredient {
  qty: string | null
  unit: Unit | null
  name: string
  note: string | null
  allergen?: string | null
  substitute?: string | null
}

export interface StepRef {
  step_index: number
  ingredient_index: number
  mention: string
}

export interface RecipeComponent {
  role: string
  name: string | null
  yield_note: string | null
  ingredients: Ingredient[]
  steps: string[]
  step_refs?: StepRef[]
}

export interface Tag {
  id: string
  name: string
  is_default: boolean
  household_id: string | null
}

export interface RecipeGroup {
  title: string | null
  servings: number | null
  kcal_per_serving: number | null
  tags: string[]
  components: RecipeComponent[]
}

export interface ImportMetadata {
  creator_handle: string | null
  thumbnail_url: string | null
  source_url: string
}

export type ImportStage = 'description' | 'link' | 'transcript' | 'failed'

export interface ImportResult {
  stage: ImportStage
  recipe: RecipeGroup | null
  metadata: ImportMetadata
  error: string | null
}

export interface StageEvent {
  key: string
  label: string
}

export interface StreamCallbacks {
  onStage: (stage: StageEvent) => void
  onDone: (result: ImportResult) => void
  onError: (error: string) => void
}

export interface StepIngredientRef {
  ingredient_index: number
  mention: string
}

export interface SaveComponent {
  name: string
  yield_note: string
  ingredients: string[]
  steps: string[]
  ingredient_flags?: AllergenFlag[]
  step_ingredient_refs?: StepIngredientRef[][] | null
}

export interface RecipeSaveRequest {
  title: string
  servings: number | null
  kcal_per_serving: number | null
  thumbnail_url: string | null
  creator_handle: string | null
  source_url: string | null
  notes?: string | null
  components: SaveComponent[]
  tag_ids: string[]
  shared_to_personal?: boolean
}

export interface RecipeOut {
  id: string
  title: string
  servings: number | null
  kcal_per_serving: number | null
  thumbnail_url: string | null
  creator_handle: string | null
  source_url: string | null
  notes: string | null
  components: SaveComponent[]
  created_at: string
  updated_at: string
  tags: Tag[]
  household_id: string | null
  shared_to_personal: boolean
  added_by: string | null
  is_favourite: boolean
}

export interface RecipeStats {
  total_recipes: number
  total_ingredients: number
  avg_kcal: number | null
  with_kcal: number
}

export interface MealPlanEntry {
  id: string
  date: string // "YYYY-MM-DD"
  recipe: RecipeOut
}

export interface UserPreferences {
  week_start_day: number // 0=Sun 1=Mon 6=Sat
  auto_substitute: boolean
  personal_allergens: AllergenData | null
  language: string
  unit_system: string // "metric" | "imperial"
}

export interface ReanalyzeProgress {
  type: 'start' | 'progress' | 'complete'
  total?: number
  done?: number
  analyzed?: number
}

export interface HouseholdOut {
  id: string
  name: string
  color: string
  created_at: string
  allergens: AllergenData | null
}

export interface MemberOut {
  user_id: string
  email: string
  nickname: string | null
  joined_at: string
}

export interface InvitationOut {
  id: string
  household_id: string
  household_name: string
  invited_by_email: string
  invited_by_nickname: string | null
  created_at: string
}

export interface AuthUser {
  id: string
  email: string
  nickname: string | null
  is_active: boolean
  is_verified: boolean
  is_superuser: boolean
  active_household_id: string | null
}

export interface RegisterData {
  email: string
  password: string
  nickname?: string
}

export interface ShoppingListItem {
  id: string
  user_id: string
  household_id: string | null
  text: string
  completed: boolean
  position: number
  created_at: string
  updated_at: string
}

export interface PresenceUser {
  user_id: string
  nickname: string
  color: string
  item_id: string | null
}
