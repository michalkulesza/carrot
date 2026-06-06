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

export interface RecipeGroup {
  title: string | null;
  servings: number | null;
  kcal_per_serving: number | null;
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
