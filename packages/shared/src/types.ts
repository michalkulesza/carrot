export const UNITS = [
  'ml', 'l', 'tsp', 'tbsp', 'cup',
  'g', 'kg',
  'clove', 'slice', 'can', 'bunch', 'pinch', 'sprig', 'handful',
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
  shopping_list_value?: string | null
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
  metric_ingredients: string[]
  imperial_ingredients: string[]
  metric_steps: string[]
  imperial_steps: string[]
  step_refs?: StepRef[]
}

export type TagCategory = 'protein' | 'carb' | 'cuisine' | 'time'

export interface Tag {
  id: string
  name: string
  is_default: boolean
  household_id: string | null
  category: TagCategory | null
}

export interface RecipeGroup {
  title: string | null
  servings: number | null
  total_time_minutes: number | null
  kcal_per_serving: number | null
  protein_per_serving: number | null
  fat_per_serving: number | null
  carbs_per_serving: number | null
  tags: string[]
  components: RecipeComponent[]
}

export interface ImportDebugUsage {
  model: string
  input_tokens: number
  output_tokens: number
  total_tokens: number
}

export interface ImportMetadata {
  creator_handle: string | null
  thumbnail_url: string | null
  source_url: string
  debug?: ImportDebugUsage | null
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

export type ImportJobKind = 'url' | 'text' | 'image'
export type ImportJobStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'
export type ImportFailureCode =
  | 'extraction_failed'
  | 'invalid_input'
  | 'household_access_changed'
  | 'retries_exhausted'
  | 'unexpected'

export interface ImportJobEnqueue {
  kind: ImportJobKind
  input: Record<string, string>
  model?: string
  idempotency_key: string
}

export interface ImportJob {
  id: string
  status: ImportJobStatus
  kind: ImportJobKind
  household_id: string | null
  created_by_user_id: string
  created_by_name: string | null
  result_recipe_id: string | null
  failure_code: ImportFailureCode | null
  retry_count: number
  next_attempt_at: string | null
  created_at: string
  updated_at: string
}

export type ImportJobOut = ImportJob

export interface ImportJobsSnapshot {
  jobs: ImportJob[]
}

export interface ImportJobEvent {
  id: number
  type:
    | 'import_job.created'
    | 'import_job.running'
    | 'import_job.retry_scheduled'
    | 'import_job.succeeded'
    | 'import_job.failed'
    | 'import_job.cancelled'
    | 'import_job.dismissed'
  job: ImportJob
}

export interface StepIngredientRef {
  ingredient_index: number
  mention: string
}

export interface SaveComponent {
  name: string
  yield_note: string
  ingredients: string[]
  shopping_list_ingredients?: string[] | null
  steps: string[]
  metric_ingredients?: string[] | null
  imperial_ingredients?: string[] | null
  metric_steps?: string[] | null
  imperial_steps?: string[] | null
  ingredient_flags?: AllergenFlag[]
  step_ingredient_refs?: StepIngredientRef[][] | null
}

export interface RecipeSaveRequest {
  title: string
  servings: number | null
  total_time_minutes: number | null
  kcal_per_serving: number | null
  protein_per_serving: number | null
  fat_per_serving: number | null
  carbs_per_serving: number | null
  thumbnail_url: string | null
  creator_handle: string | null
  source_url: string | null
  notes?: string | null
  components: SaveComponent[]
  tag_ids: string[]
  shared_to_personal?: boolean
  debug_model?: string | null
  debug_input_tokens?: number | null
  debug_output_tokens?: number | null
  debug_total_tokens?: number | null
}

export interface RecipeOut {
  id: string
  title: string
  servings: number | null
  total_time_minutes: number | null
  kcal_per_serving: number | null
  protein_per_serving: number | null
  fat_per_serving: number | null
  carbs_per_serving: number | null
  thumbnail_url: string | null
  creator_handle: string | null
  source_url: string | null
  notes: string | null
  debug_model?: string | null
  debug_input_tokens?: number | null
  debug_output_tokens?: number | null
  debug_total_tokens?: number | null
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
  avg_protein: number | null
  with_protein: number
  avg_fat: number | null
  with_fat: number
  avg_carbs: number | null
  with_carbs: number
}

export interface MealPlanEntry {
  id: string
  date: string // "YYYY-MM-DD"
  recipe: RecipeOut | null
  text: string | null
}

export interface UserPreferences {
  week_start_day: number // 0=Sun 1=Mon 6=Sat
  auto_substitute: boolean
  personal_allergens: AllergenData | null
  language: string
  unit_system: string // "metric" | "imperial"
  share_imports_to_personal: boolean
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

export interface HouseholdLeaveNotificationOut {
  id: string
  household_id: string
  household_name: string
  left_user_email: string
  left_user_nickname: string | null
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
