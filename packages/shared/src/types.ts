export const UNITS = [
  "ml",
  "l",
  "tsp",
  "tbsp",
  "cup",
  "cl",
  "g",
  "kg",
  "oz",
  "lb",
  "clove",
  "leaf",
  "sheet",
  "slice",
  "can",
  "bunch",
  "pinch",
  "sprig",
  "handful",
  "piece",
] as const;

export type Unit = (typeof UNITS)[number];

export const SHOPPING_CATEGORIES = [
  "produce",
  "pantry",
  "dairy_eggs",
  "meat_seafood",
  "frozen",
  "other",
] as const;

export type ShoppingCategory = (typeof SHOPPING_CATEGORIES)[number];

export const DEFAULT_SHOPPING_CATEGORIES: ShoppingCategory[] = [
  ...SHOPPING_CATEGORIES,
];

export interface ShoppingListItemInput {
  id: string;
  text: string;
  category: ShoppingCategory;
}

export type ShoppingCategoryOrders = Partial<
  Record<ShoppingCategory, string[]>
>;

export const isShoppingCategory = (value: string): value is ShoppingCategory =>
  SHOPPING_CATEGORIES.includes(value as ShoppingCategory);

export const normalizeShoppingCategories = (
  categories: readonly ShoppingCategory[] | null | undefined,
): ShoppingCategory[] => {
  const enabled = new Set(categories);
  return SHOPPING_CATEGORIES.filter(
    (category) => category === "other" || enabled.has(category),
  );
};

export interface AllergenFlag {
  allergen: string | null;
  substitute: string | null;
  substitute_applied: boolean;
  original_display: string | null;
  original_values?: Record<string, string> | null;
  linked_allergens?: string[] | null;
  ingredient_name?: string | null;
}

export interface Ingredient {
  qty: string | null;
  unit: Unit | null;
  name: string;
  shopping_list_value?: string | null;
  shopping_list_category?: ShoppingCategory | null;
  allergen?: string | null;
  substitute?: string | null;
}

export interface RecipeComponent {
  role: string;
  name: string | null;
  yield_note: string | null;
  ingredients: Ingredient[];
  steps: string[];
  metric_ingredients: string[];
  imperial_ingredients: string[];
  metric_steps: string[];
  imperial_steps: string[];
  shopping_list_categories?: ShoppingCategory[] | null;
  step_ingredient_line?: (number | null)[] | null;
  ingredient_links?: (string | null)[];
  linked_recipe_ids?: (string | null)[];
  ingredient_evidence?: { references?: unknown[]; links?: unknown[] }[];
  step_evidence?: { references?: unknown[] }[];
  name_evidence?: unknown[];
  title_evidence?: unknown[];
}

export type TagCategory = "meal" | "protein" | "carb" | "cuisine" | "time";

export interface Tag {
  id: string;
  name: string;
  is_default: boolean;
  household_id: string | null;
  category: TagCategory | null;
}

export interface RecipeGroup {
  title: string | null;
  servings: number | null;
  total_time_minutes: number | null;
  kcal_per_serving: number | null;
  protein_per_serving: number | null;
  fat_per_serving: number | null;
  carbs_per_serving: number | null;
  tags: string[];
  components: RecipeComponent[];
}

export interface ImportMetadata {
  creator_handle: string | null;
  thumbnail_url: string | null;
  source_url: string;
}

export type ImportStage = "description" | "link" | "transcript" | "failed";

export interface ImportResult {
  stage: ImportStage;
  recipe: RecipeGroup | null;
  metadata: ImportMetadata;
  error: string | null;
}

export interface StageEvent {
  key: string;
  label: string;
}

export interface LinkedRecipeImportResult {
  recipe_id: string | null;
  job_id: string | null;
}

export type ImportJobKind = "url" | "text" | "image";
export type ImportJobStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";
export type ImportFailureCode =
  | "extraction_failed"
  | "user_action_required"
  | "invalid_input"
  | "household_access_changed"
  | "retries_exhausted"
  | "unexpected"
  | "unsupported_source"
  | "unsupported_language"
  | "language_undetermined"
  | "no_recipe_content"
  | "ambiguous_recipe"
  | "unreadable_content"
  | "source_fetch_failed"
  | "transcription_failed"
  | "model_timeout"
  | "model_rate_limited"
  | "invalid_model_response"
  | "unknown_error";

export type RecipeIssueCode = "MISSING_INGREDIENTS" | "MISSING_INSTRUCTIONS";
export type ValueProvenanceStatus = "source" | "ai" | "user" | "unknown";
export interface ValueProvenance {
  status: ValueProvenanceStatus;
  references?: unknown[];
}

export interface ImportJobEnqueue {
  kind: ImportJobKind;
  input: Record<string, string>;
  model?: string;
  idempotency_key: string;
}

export interface ImportJob {
  id: string;
  status: ImportJobStatus;
  kind: ImportJobKind;
  source_url: string | null;
  household_id: string | null;
  created_by_user_id: string;
  created_by_name: string | null;
  result_recipe_id: string | null;
  failure_code: ImportFailureCode | null;
  failure_stage: string | null;
  outcome: "complete" | "incomplete" | "failed" | null;
  retry_count: number;
  next_attempt_at: string | null;
  device_capture_eligible: boolean;
  created_at: string;
  updated_at: string;
}

export interface CapturedHtmlPayload {
  html: string;
  final_url: string;
}

export type ImportJobOut = ImportJob;

export interface ImportJobsSnapshot {
  jobs: ImportJob[];
}

export interface AllergenRecheckStatus {
  total: number;
  pending: number;
  running: number;
  failed: number;
  completed: number;
  done: boolean;
}

export interface ImportJobEvent {
  id: number;
  type:
    | "import_job.created"
    | "import_job.running"
    | "import_job.retry_scheduled"
    | "import_job.succeeded"
    | "import_job.failed"
    | "import_job.cancelled"
    | "import_job.dismissed";
  job: ImportJob;
}

export interface SaveComponent {
  name: string;
  yield_note: string;
  ingredients: string[];
  shopping_list_ingredients?: string[] | null;
  shopping_list_categories?: ShoppingCategory[] | null;
  steps: string[];
  metric_ingredients?: string[] | null;
  imperial_ingredients?: string[] | null;
  metric_steps?: string[] | null;
  imperial_steps?: string[] | null;
  ingredient_flags?: AllergenFlag[];
  step_ingredient_line?: (number | null)[] | null;
  ingredient_links?: (string | null)[];
  linked_recipe_ids?: (string | null)[];
  ingredient_evidence?: { references?: unknown[]; links?: unknown[] }[];
  step_evidence?: { references?: unknown[] }[];
  name_evidence?: unknown[];
}

export interface RecipeSaveRequest {
  title: string;
  servings: number | null;
  total_time_minutes: number | null;
  kcal_per_serving: number | null;
  protein_per_serving: number | null;
  fat_per_serving: number | null;
  carbs_per_serving: number | null;
  thumbnail_url: string | null;
  creator_handle: string | null;
  source_url: string | null;
  notes?: string | null;
  components: SaveComponent[];
  tag_ids: string[];
}

export interface RecipeOut {
  id: string;
  title: string;
  source_title: string | null;
  servings: number | null;
  total_time_minutes: number | null;
  kcal_per_serving: number | null;
  protein_per_serving: number | null;
  fat_per_serving: number | null;
  carbs_per_serving: number | null;
  thumbnail_url: string | null;
  creator_handle: string | null;
  source_url: string | null;
  notes: string | null;
  issue_codes: RecipeIssueCode[];
  nutrition_provenance: Partial<
    Record<
      | "kcal_per_serving"
      | "protein_per_serving"
      | "fat_per_serving"
      | "carbs_per_serving",
      ValueProvenance
    >
  >;
  nutrition_status: "complete" | "incomplete" | "unknown";
  total_time_provenance: ValueProvenance;
  allergen_status: "analyzed" | "uncertain" | "unknown";
  overview: string | null;
  title_evidence: unknown[];
  components: SaveComponent[];
  created_at: string;
  updated_at: string;
  tags: Tag[];
  household_ids: string[];
  author_id: string | null;
  added_by: string | null;
  is_favourite: boolean;
}

export interface RecipeSourceEvidence {
  schema_version: number;
  evidence: {
    id: string;
    kind: string;
    source_url: string;
    text: string;
    language: { code: string | null; confidence: number | null };
    author_verified?: boolean | null;
  }[];
  trace: {
    stage: string;
    event: string;
    detail?: string | null;
    evidence_ids: string[];
  }[];
}

export interface PublicRecipeTag {
  name: string;
  category: TagCategory | null;
}

export interface PublicRecipeOut {
  title: string;
  servings: number | null;
  total_time_minutes: number | null;
  total_time_provenance: ValueProvenance;
  kcal_per_serving: number | null;
  protein_per_serving: number | null;
  fat_per_serving: number | null;
  carbs_per_serving: number | null;
  nutrition_provenance: RecipeOut["nutrition_provenance"];
  nutrition_status: RecipeOut["nutrition_status"];
  allergen_status: RecipeOut["allergen_status"];
  overview: string | null;
  thumbnail_url: string | null;
  source_url: string | null;
  components: SaveComponent[];
  tags: PublicRecipeTag[];
}

export interface RecipePublicShare {
  url: string;
  expires_at: string;
}

export interface RecipeStats {
  total_recipes: number;
  total_ingredients: number;
  avg_kcal: number | null;
  with_kcal: number;
  avg_protein: number | null;
  with_protein: number;
  avg_fat: number | null;
  with_fat: number;
  avg_carbs: number | null;
  with_carbs: number;
}

export interface MealPlanEntry {
  id: string;
  date: string; // "YYYY-MM-DD"
  recipe: RecipeOut | null;
  text: string | null;
}

export interface UserPreferences {
  week_start_day: number; // 0=Sun 1=Mon 6=Sat
  auto_substitute: boolean;
  personal_allergens: string[] | null;
  language: string;
  unit_system: string; // "metric" | "imperial"
  recipe_serving_overrides: Record<string, number>;
  shopping_categories: ShoppingCategory[];
  show_completed_shopping_items: boolean;
}

export interface HouseholdOut {
  id: string;
  name: string;
  color: string;
  created_at: string;
  allergens: string[] | null;
  invite_code: string;
}

export type HouseholdRole = "admin" | "member";

export interface MemberOut {
  user_id: string;
  email: string;
  nickname: string | null;
  joined_at: string;
  role: HouseholdRole;
}

export interface InvitationOut {
  id: string;
  household_id: string;
  household_name: string;
  invited_by_email: string;
  invited_by_nickname: string | null;
  created_at: string;
}

export interface HouseholdLeaveNotificationOut {
  id: string;
  household_id: string;
  household_name: string;
  left_user_email: string;
  left_user_nickname: string | null;
  created_at: string;
}

export interface AuthUser {
  id: string;
  email: string;
  nickname: string | null;
  is_active: boolean;
  is_verified: boolean;
  is_superuser: boolean;
  active_household_id: string | null;
}

export interface ShoppingListItem {
  id: string;
  user_id: string;
  household_id: string | null;
  text: string;
  completed: boolean;
  category: ShoppingCategory;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface PresenceUser {
  user_id: string;
  nickname: string;
  color: string;
  item_id: string | null;
}
