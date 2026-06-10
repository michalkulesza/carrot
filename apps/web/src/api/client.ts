export interface AllergenData {
  predefined: string[];
  custom: string[];
}

export interface AllergenFlag {
  allergen: string | null;
  substitute: string | null;
  substitute_applied: boolean;
  original_display: string | null;
  ingredient_name?: string | null;
}

export interface Ingredient {
  qty: string | null;
  unit: string | null;
  name: string;
  note: string | null;
  allergen?: string | null;
  substitute?: string | null;
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
  household_id: string | null;
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
  ingredient_flags?: AllergenFlag[];
}

export interface RecipeSaveRequest {
  title: string;
  servings: number | null;
  kcal_per_serving: number | null;
  thumbnail_url: string | null;
  creator_handle: string | null;
  source_url: string | null;
  notes?: string | null;
  components: SaveComponent[];
  tag_ids: string[];
  shared_to_personal?: boolean;
}

export interface RecipeOut {
  id: string;
  title: string;
  servings: number | null;
  kcal_per_serving: number | null;
  thumbnail_url: string | null;
  creator_handle: string | null;
  source_url: string | null;
  notes: string | null;
  components: SaveComponent[];
  created_at: string;
  tags: Tag[];
  household_id: string | null;
  shared_to_personal: boolean;
  added_by: string | null;
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

export async function listPersonalRecipes(): Promise<RecipeOut[]> {
  const res = await fetch("/api/recipes?personal=true", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load personal recipes");
  return res.json() as Promise<RecipeOut[]>;
}

export async function linkRecipeToHousehold(id: string): Promise<RecipeOut> {
  const res = await fetch(`/api/recipes/${id}/link-to-household`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { detail?: unknown };
    throw new Error(typeof err.detail === "string" ? err.detail : "Failed to link recipe");
  }
  return res.json() as Promise<RecipeOut>;
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

export async function reorderRecipes(ids: string[]): Promise<void> {
  const res = await fetch("/api/recipes/order", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error("Failed to reorder recipes");
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
  auto_substitute: boolean;
  personal_allergens: AllergenData | null;
  language: string;
}

export async function getPreferences(): Promise<UserPreferences> {
  const res = await fetch("/api/preferences", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load preferences");
  return res.json() as Promise<UserPreferences>;
}

export async function updatePreferences(data: Partial<UserPreferences>): Promise<UserPreferences> {
  const res = await fetch("/api/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update preferences");
  return res.json() as Promise<UserPreferences>;
}

export async function updateHouseholdAllergens(householdId: string, allergens: AllergenData): Promise<HouseholdOut> {
  const res = await fetch(`/api/households/${householdId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ allergens }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { detail?: unknown };
    throw new Error(typeof err.detail === "string" ? err.detail : "Failed to update allergens");
  }
  return res.json() as Promise<HouseholdOut>;
}

export interface ReanalyzeProgress {
  type: "start" | "progress" | "complete";
  total?: number;
  done?: number;
  analyzed?: number;
}

export function streamReanalyze(callbacks: {
  onStart: (total: number) => void;
  onProgress: (done: number, total: number) => void;
  onComplete: (analyzed: number) => void;
  onError: (msg: string) => void;
}): () => void {
  let aborted = false;
  fetch("/api/allergens/reanalyze", { method: "POST", credentials: "include" }).then(async (res) => {
    if (!res.ok || !res.body) {
      callbacks.onError("Failed to start re-analysis");
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (!aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const data = line.replace(/^data: /, "").trim();
        if (!data) continue;
        try {
          const event = JSON.parse(data) as ReanalyzeProgress;
          if (event.type === "start") callbacks.onStart(event.total ?? 0);
          else if (event.type === "progress") callbacks.onProgress(event.done ?? 0, event.total ?? 0);
          else if (event.type === "complete") callbacks.onComplete(event.analyzed ?? 0);
        } catch { /* ignore */ }
      }
    }
  }).catch(() => callbacks.onError("Connection error"));
  return () => { aborted = true; };
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

// ── Households ────────────────────────────────────────────────────────────────

export interface HouseholdOut {
  id: string;
  name: string;
  color: string;
  created_at: string;
  allergens: AllergenData | null;
}

export interface MemberOut {
  user_id: string;
  email: string;
  nickname: string | null;
  joined_at: string;
}

export interface InvitationOut {
  id: string;
  household_id: string;
  household_name: string;
  invited_by_email: string;
  invited_by_nickname: string | null;
  created_at: string;
}

export async function createHousehold(name?: string, color?: string): Promise<HouseholdOut> {
  const res = await fetch("/api/households", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name: name ?? null, color: color ?? "#6366f1" }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { detail?: unknown };
    throw new Error(typeof err.detail === "string" ? err.detail : "Failed to create household");
  }
  return res.json() as Promise<HouseholdOut>;
}

export async function listHouseholds(): Promise<HouseholdOut[]> {
  const res = await fetch("/api/households", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load households");
  return res.json() as Promise<HouseholdOut[]>;
}

export async function updateHousehold(id: string, data: { name?: string; color?: string }): Promise<HouseholdOut> {
  const res = await fetch(`/api/households/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { detail?: unknown };
    throw new Error(typeof err.detail === "string" ? err.detail : "Failed to update household");
  }
  return res.json() as Promise<HouseholdOut>;
}

export async function leaveHousehold(id: string): Promise<void> {
  const res = await fetch(`/api/households/${id}/leave`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { detail?: unknown };
    throw new Error(typeof err.detail === "string" ? err.detail : "Failed to leave household");
  }
}

export async function listMembers(householdId: string): Promise<MemberOut[]> {
  const res = await fetch(`/api/households/${householdId}/members`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load members");
  return res.json() as Promise<MemberOut[]>;
}

export async function switchHousehold(householdId: string | null): Promise<void> {
  const res = await fetch("/api/me/active-household", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ household_id: householdId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { detail?: unknown };
    throw new Error(typeof err.detail === "string" ? err.detail : "Failed to switch context");
  }
}

export async function inviteUser(householdId: string, email: string): Promise<void> {
  const res = await fetch(`/api/households/${householdId}/invitations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { detail?: unknown };
    throw new Error(typeof err.detail === "string" ? err.detail : "Failed to send invitation");
  }
}

export async function listInvitations(): Promise<InvitationOut[]> {
  const res = await fetch("/api/invitations", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load invitations");
  return res.json() as Promise<InvitationOut[]>;
}

export async function acceptInvitation(id: string): Promise<void> {
  const res = await fetch(`/api/invitations/${id}/accept`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to accept invitation");
}

export async function declineInvitation(id: string): Promise<void> {
  const res = await fetch(`/api/invitations/${id}/decline`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to decline invitation");
}
