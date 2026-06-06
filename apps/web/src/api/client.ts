export interface Ingredient {
  qty: string | null;
  unit: string | null;
  name: string;
  note: string | null;
}

export interface RecipeComponent {
  role: string;
  name: string | null;
  yield_note: string | null;
  ingredients: Ingredient[];
  steps: string[];
}

export interface Tag {
  id: string;
  name: string;
  is_default: boolean;
}

export interface RecipeGroup {
  title: string | null;
  servings: number | null;
  kcal_per_serving: number | null;
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

export interface StreamCallbacks {
  onStage: (stage: StageEvent) => void;
  onDone: (result: ImportResult) => void;
  onError: (error: string) => void;
}

// ── Recipe save / list ────────────────────────────────────────────────────────

export interface SaveComponent {
  name: string;
  yield_note: string;
  ingredients: string[];
  steps: string[];
}

export interface RecipeSaveRequest {
  title: string;
  servings: number | null;
  kcal_per_serving: number | null;
  thumbnail_url: string | null;
  creator_handle: string | null;
  components: SaveComponent[];
  tag_ids: string[];
}

export interface RecipeOut {
  id: string;
  title: string;
  servings: number | null;
  kcal_per_serving: number | null;
  thumbnail_url: string | null;
  creator_handle: string | null;
  components: SaveComponent[];
  created_at: string;
  tags: Tag[];
}

export async function saveRecipe(data: RecipeSaveRequest): Promise<RecipeOut> {
  const res = await fetch("/api/recipes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { detail?: unknown };
    throw new Error(typeof err.detail === "string" ? err.detail : "Failed to save recipe");
  }
  return res.json() as Promise<RecipeOut>;
}

export async function updateRecipe(id: string, data: RecipeSaveRequest): Promise<RecipeOut> {
  const res = await fetch(`/api/recipes/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { detail?: unknown };
    throw new Error(typeof err.detail === "string" ? err.detail : "Failed to update recipe");
  }
  return res.json() as Promise<RecipeOut>;
}

export async function deleteRecipe(id: string): Promise<void> {
  const res = await fetch(`/api/recipes/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { detail?: unknown };
    throw new Error(typeof err.detail === "string" ? err.detail : "Failed to delete recipe");
  }
}

export interface RecipeStats {
  total_recipes: number;
  total_ingredients: number;
  avg_kcal: number | null;
  with_kcal: number;
}

export async function fetchStats(): Promise<RecipeStats> {
  const res = await fetch("/api/recipes/stats", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load stats");
  return res.json() as Promise<RecipeStats>;
}

export async function listRecipes(): Promise<RecipeOut[]> {
  const res = await fetch("/api/recipes", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load recipes");
  return res.json() as Promise<RecipeOut[]>;
}

export async function exportRecipes(): Promise<void> {
  const res = await fetch("/api/recipes/export", { credentials: "include" });
  if (!res.ok) throw new Error("Export failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "recipes.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export async function importRecipes(file: File): Promise<{ imported: number }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/recipes/import", {
    method: "POST",
    credentials: "include",
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { detail?: unknown };
    throw new Error(typeof err.detail === "string" ? err.detail : "Import failed");
  }
  return res.json() as Promise<{ imported: number }>;
}

// ── Tags ──────────────────────────────────────────────────────────────────────

export async function listTags(): Promise<Tag[]> {
  const res = await fetch("/api/tags", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load tags");
  return res.json() as Promise<Tag[]>;
}

export async function createTag(name: string): Promise<Tag> {
  const res = await fetch("/api/tags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { detail?: unknown };
    throw new Error(typeof err.detail === "string" ? err.detail : "Failed to create tag");
  }
  return res.json() as Promise<Tag>;
}

export async function addTagToRecipe(recipeId: string, tagId: string): Promise<void> {
  const res = await fetch(`/api/recipes/${recipeId}/tags/${tagId}`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to add tag");
}

export async function removeTagFromRecipe(recipeId: string, tagId: string): Promise<void> {
  const res = await fetch(`/api/recipes/${recipeId}/tags/${tagId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to remove tag");
}

// ── Meal Plan ─────────────────────────────────────────────────────────────────

export interface MealPlanEntry {
  id: string;
  date: string; // "YYYY-MM-DD"
  recipe: RecipeOut;
}

export async function listMealPlan(month: string): Promise<MealPlanEntry[]> {
  const res = await fetch(`/api/meal-plan?month=${month}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load meal plan");
  return res.json() as Promise<MealPlanEntry[]>;
}

export async function setMealPlanEntry(date: string, recipeId: string): Promise<MealPlanEntry> {
  const res = await fetch(`/api/meal-plan/${date}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ recipe_id: recipeId }),
  });
  if (!res.ok) throw new Error("Failed to set meal plan entry");
  return res.json() as Promise<MealPlanEntry>;
}

export async function deleteMealPlanEntry(date: string): Promise<void> {
  const res = await fetch(`/api/meal-plan/${date}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to delete meal plan entry");
}

// ── Preferences ───────────────────────────────────────────────────────────────

export interface UserPreferences {
  week_start_day: number; // 0=Sun 1=Mon 6=Sat
}

export async function getPreferences(): Promise<UserPreferences> {
  const res = await fetch("/api/preferences", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load preferences");
  return res.json() as Promise<UserPreferences>;
}

export async function updatePreferences(data: UserPreferences): Promise<UserPreferences> {
  const res = await fetch("/api/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update preferences");
  return res.json() as Promise<UserPreferences>;
}

export function streamImport(url: string, callbacks: StreamCallbacks): () => void {
  const source = new EventSource(
    `/api/imports/stream?url=${encodeURIComponent(url)}&model=gemini-2.5-flash-lite`
  );

  source.onmessage = (event) => {
    const data = JSON.parse(event.data as string);
    if (data.type === "stage") {
      callbacks.onStage({ key: data.key as string, label: data.label as string });
    } else if (data.type === "done") {
      callbacks.onDone(data.result as ImportResult);
      source.close();
    }
  };

  source.onerror = () => {
    callbacks.onError("Connection error — check the API server.");
    source.close();
  };

  return () => source.close();
}
