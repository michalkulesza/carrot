import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Switch,
  addToast,
} from "@heroui/react";
import {
  streamImport,
  saveRecipe,
  createTag,
  listPersonalRecipes,
  linkRecipeToHousehold,
  ImportResult,
  RecipeComponent,
  RecipeOut,
  StageEvent,
  Tag,
} from "../api/client";
import TagRow from "./TagRow";
import { useHousehold } from "../context/HouseholdContext";

// ── Types ────────────────────────────────────────────────────────────────────

interface StepState extends StageEvent {
  status: "active" | "done";
}

interface EditableComponent {
  name: string;
  yield_note: string;
  ingredients: string[];
  steps: string[];
}

interface EditableRecipe {
  title: string;
  servings: string;
  kcal: string;
  thumbnail_url: string | null;
  creator_handle: string | null;
  source_url: string | null;
  stage: string;
  components: EditableComponent[];
  suggestedTagNames: string[];
}

function toEditable(result: ImportResult): EditableRecipe {
  const { recipe, metadata, stage } = result;
  return {
    title: recipe?.title ?? "",
    servings: recipe?.servings?.toString() ?? "",
    kcal: recipe?.kcal_per_serving?.toString() ?? "",
    thumbnail_url: metadata.thumbnail_url,
    creator_handle: metadata.creator_handle,
    source_url: metadata.source_url || null,
    stage,
    suggestedTagNames: recipe?.tags ?? [],
    components: (recipe?.components ?? []).map((c: RecipeComponent) => ({
      name: c.name ?? c.role,
      yield_note: c.yield_note ?? "",
      ingredients: c.ingredients.map((ing) =>
        [ing.qty, ing.unit, ing.name, ing.note ? `(${ing.note})` : null].filter(Boolean).join(" ")
      ),
      steps: c.steps,
    })),
  };
}

// ── Progress list ────────────────────────────────────────────────────────────

function ProgressList({ steps }: { steps: StepState[] }) {
  if (steps.length === 0) return null;
  return (
    <ul className="list-none p-0 m-0 space-y-1 mt-3">
      {steps.map((s) => (
        <li
          key={s.key}
          className={`flex items-center gap-2 text-sm ${
            s.status === "active" ? "text-primary font-semibold" : "text-default-500"
          }`}
        >
          <span className="w-4 text-center">{s.status === "done" ? "✓" : "⋯"}</span>
          {s.label}
        </li>
      ))}
    </ul>
  );
}

// ── Inline editable field ─────────────────────────────────────────────────────

function EditLine({
  value,
  onChange,
  className = "",
  multiline = false,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  multiline?: boolean;
}) {
  const base =
    "w-full bg-transparent border-b border-transparent hover:border-default-300 focus:border-primary focus:outline-none transition-colors resize-none";
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = `${ref.current.scrollHeight}px`;
    }
  }, [value]);

  if (multiline) {
    return (
      <textarea
        ref={ref}
        value={value}
        rows={1}
        onChange={(e) => onChange(e.target.value)}
        className={`${base} overflow-hidden ${className}`}
      />
    );
  }
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${base} ${className}`}
    />
  );
}

// ── Editable recipe ───────────────────────────────────────────────────────────

const currentUsername = () => localStorage.getItem("pk_username") || "you";

function EditableRecipeView({
  recipe,
  selectedTags,
  allTags,
  onChange,
  onTagAdd,
  onTagRemove,
  onTagCreate,
}: {
  recipe: EditableRecipe;
  selectedTags: Tag[];
  allTags: Tag[];
  onChange: (r: EditableRecipe) => void;
  onTagAdd: (tag: Tag) => void;
  onTagRemove: (tagId: string) => void;
  onTagCreate: (name: string) => Promise<Tag>;
}) {
  const [isAdapted, setIsAdapted] = useState(false);
  const [showImgInput, setShowImgInput] = useState(false);
  const [imgDraft, setImgDraft] = useState("");

  function setTitle(title: string) { onChange({ ...recipe, title }); }
  function setServings(servings: string) { onChange({ ...recipe, servings }); }
  function setKcal(kcal: string) { onChange({ ...recipe, kcal }); }

  function setIngredient(ci: number, ii: number, val: string) {
    setIsAdapted(true);
    const components = recipe.components.map((c, ci2) =>
      ci2 !== ci ? c : {
        ...c,
        ingredients: c.ingredients.map((ing, ii2) => (ii2 === ii ? val : ing)),
      }
    );
    onChange({ ...recipe, components });
  }

  function setStep(ci: number, si: number, val: string) {
    setIsAdapted(true);
    const components = recipe.components.map((c, ci2) =>
      ci2 !== ci ? c : {
        ...c,
        steps: c.steps.map((s, si2) => (si2 === si ? val : s)),
      }
    );
    onChange({ ...recipe, components });
  }

  function openImgEditor() {
    setImgDraft(recipe.thumbnail_url ?? "");
    setShowImgInput(true);
  }

  function commitImg() {
    const trimmed = imgDraft.trim();
    onChange({ ...recipe, thumbnail_url: trimmed || null });
    setShowImgInput(false);
  }

  const proxyUrl = recipe.thumbnail_url
    ? `/api/proxy/image?url=${encodeURIComponent(recipe.thumbnail_url)}`
    : null;

  const originalHandle = recipe.creator_handle;
  const myHandle = currentUsername();

  return (
    <div className="mt-4 border-t border-divider pt-4">
      {/* Header */}
      <div className="flex gap-3 items-start mb-2">
        <button
          type="button"
          onClick={openImgEditor}
          className="relative w-16 h-16 rounded-lg shrink-0 overflow-hidden bg-default-100 group cursor-pointer"
        >
          {proxyUrl ? (
            <img src={proxyUrl} alt="thumbnail" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-default-300 text-2xl">🖼</div>
          )}
          <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <span className="text-white text-[10px] font-semibold uppercase tracking-wide">Edit</span>
          </div>
        </button>
        <div className="flex-1 min-w-0">
          <EditLine
            value={recipe.title}
            onChange={setTitle}
            className="text-lg font-bold leading-snug"
            multiline
          />
        </div>
      </div>

      {showImgInput && (
        <input
          type="url"
          value={imgDraft}
          onChange={(e) => setImgDraft(e.target.value)}
          onBlur={commitImg}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commitImg(); }
            if (e.key === "Escape") setShowImgInput(false);
          }}
          placeholder="Image URL"
          autoFocus
          className="w-full text-sm border-b border-primary focus:outline-none bg-transparent mb-2"
        />
      )}

      {/* Tags */}
      <div className="mb-3">
        <TagRow
          tags={selectedTags}
          allTags={allTags}
          onAdd={onTagAdd}
          onRemove={onTagRemove}
          onCreateTag={onTagCreate}
        />
      </div>

      {/* Pills */}
      <div className="flex flex-col gap-2 mb-4">
        {(originalHandle || recipe.source_url) && (
          <div className="flex flex-wrap gap-2">
            {originalHandle && (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full bg-default-100 text-default-500">
                By: @{originalHandle}
              </span>
            )}
            {recipe.source_url && (
              <a
                href={recipe.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-default-100 text-default-500 hover:bg-default-200 hover:text-default-700 transition-colors"
              >
                <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Source
              </a>
            )}
            {isAdapted && (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full bg-success/10 text-success-700 animate-appearance-in">
                ✎ Adapted by: @{myHandle}
              </span>
            )}
          </div>
        )}
        {(recipe.servings !== "" || recipe.kcal !== "") && (
          <div className="flex gap-2">
            {recipe.servings !== "" && (
              <label className="flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-medium pl-3 pr-2 py-1.5 rounded-full cursor-text">
                <span>Serves</span>
                <input
                  type="number"
                  min={1}
                  max={67}
                  value={recipe.servings}
                  onChange={(e) => {
                    const v = Math.min(67, Math.max(1, Number(e.target.value)));
                    setServings(String(v));
                  }}
                  className="w-[2.2ch] bg-transparent text-primary font-semibold text-xs text-center focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              </label>
            )}
            {recipe.kcal !== "" && (
              <label className="flex items-center gap-1.5 bg-warning/10 text-warning-700 text-xs font-medium pl-2 pr-3 py-1.5 rounded-full cursor-text">
                <input
                  type="number"
                  min={1}
                  max={9999}
                  value={recipe.kcal}
                  onChange={(e) => {
                    const v = Math.min(9999, Math.max(1, Number(e.target.value)));
                    setKcal(String(v));
                  }}
                  className="w-[3.8ch] bg-transparent text-warning-700 font-semibold text-xs text-center focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span>kcal / serving</span>
              </label>
            )}
          </div>
        )}
      </div>

      {/* Components */}
      {recipe.components.map((comp, ci) => (
        <div key={ci} className="mb-5">
          {recipe.components.length > 1 && (
            <h3 className="text-sm font-semibold text-default-600 mb-2">{comp.name}</h3>
          )}

          {comp.ingredients.length > 0 && (
            <>
              <p className="text-xs font-semibold uppercase text-default-400 mb-1">Ingredients</p>
              <ul className="space-y-1 mb-3">
                {comp.ingredients.map((ing, ii) => (
                  <li key={ii} className="flex items-start gap-2 text-sm">
                    <span className="text-default-300 mt-1.5 shrink-0">·</span>
                    <EditLine value={ing} onChange={(v) => setIngredient(ci, ii, v)} />
                  </li>
                ))}
              </ul>
            </>
          )}

          {comp.steps.length > 0 && (
            <>
              <p className="text-xs font-semibold uppercase text-default-400 mb-1">Steps</p>
              <ol className="space-y-2">
                {comp.steps.map((step, si) => (
                  <li key={si} className="flex items-start gap-2 text-sm">
                    <span className="text-default-400 font-medium shrink-0">{si + 1}.</span>
                    <EditLine value={step} onChange={(v) => setStep(ci, si, v)} multiline />
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────────

interface AddRecipeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
  allTags: Tag[];
  onTagCreated: (tag: Tag) => void;
}

export default function AddRecipeModal({ isOpen, onClose, onSaved, allTags, onTagCreated }: AddRecipeModalProps) {
  const { activeHouseholdId } = useHousehold();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progressSteps, setProgressSteps] = useState<StepState[]>([]);
  const [editable, setEditable] = useState<EditableRecipe | null>(null);
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [sharedToPersonal, setSharedToPersonal] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const [personalRecipes, setPersonalRecipes] = useState<RecipeOut[]>([]);
  const [librarySearch, setLibrarySearch] = useState("");
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    if (isOpen && activeHouseholdId) {
      listPersonalRecipes().then(setPersonalRecipes).catch(() => {});
    }
  }, [isOpen, activeHouseholdId]);

  function reset() {
    cancelRef.current?.();
    setUrl("");
    setLoading(false);
    setSaving(false);
    setProgressSteps([]);
    setEditable(null);
    setSelectedTags([]);
    setSharedToPersonal(true);
    setError(null);
    setLibrarySearch("");
  }

  async function handleLink(id: string) {
    setLinking(true);
    setError(null);
    try {
      await linkRecipeToHousehold(id);
      addToast({ title: "Recipe added to household", color: "success", timeout: 3000 });
      onSaved?.();
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add recipe");
    } finally {
      setLinking(false);
    }
  }

  async function handleTagCreate(name: string): Promise<Tag> {
    const tag = await createTag(name);
    onTagCreated(tag);
    return tag;
  }

  async function handleSave() {
    if (!editable) return;
    setSaving(true);
    setError(null);
    try {
      await saveRecipe({
        title: editable.title,
        servings: editable.servings !== "" ? Number(editable.servings) : null,
        kcal_per_serving: editable.kcal !== "" ? Number(editable.kcal) : null,
        thumbnail_url: editable.thumbnail_url,
        creator_handle: editable.creator_handle,
        source_url: editable.source_url,
        components: editable.components,
        tag_ids: selectedTags.map((t) => t.id),
        shared_to_personal: sharedToPersonal,
      });
      addToast({ title: "Recipe saved", color: "success", timeout: 3000 });
      onSaved?.();
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save recipe");
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text.trim());
    } catch { /* permission denied */ }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    cancelRef.current?.();
    setLoading(true);
    setError(null);
    setEditable(null);
    setSelectedTags([]);
    setProgressSteps([]);

    cancelRef.current = streamImport(url, {
      onStage(stage) {
        setProgressSteps((prev) => {
          const updated = prev.map((s) =>
            s.status === "active" ? { ...s, status: "done" as const } : s
          );
          return [...updated, { ...stage, status: "active" }];
        });
      },
      onDone(res) {
        setProgressSteps((prev) =>
          prev.map((s) => (s.status === "active" ? { ...s, status: "done" as const } : s))
        );
        if (res.recipe) {
          const editableRecipe = toEditable(res);
          setEditable(editableRecipe);
          // Pre-select tags suggested by Gemini
          const suggested = allTags.filter((t) =>
            editableRecipe.suggestedTagNames.some(
              (name) => name.toLowerCase() === t.name.toLowerCase()
            )
          );
          setSelectedTags(suggested);
        } else {
          setError(res.error ?? "Import failed");
        }
        setLoading(false);
      },
      onError(msg) {
        setError(msg);
        setLoading(false);
      },
    });
  }

  const parsed = editable !== null;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="lg" scrollBehavior="inside" classNames={{ base: "!rounded-xl overflow-hidden" }}>
      <ModalContent>
        <ModalHeader>{parsed ? "Edit Recipe" : "Import Recipe"}</ModalHeader>
        <ModalBody>
          {!parsed && activeHouseholdId && personalRecipes.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-default-400">From Personal Library</p>
              <Input
                size="sm"
                placeholder="Search your recipes…"
                value={librarySearch}
                onValueChange={setLibrarySearch}
                startContent={
                  <svg className="w-3.5 h-3.5 text-default-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                }
              />
              <ul className="max-h-44 overflow-y-auto flex flex-col gap-0.5">
                {personalRecipes
                  .filter((r) => r.title.toLowerCase().includes(librarySearch.toLowerCase()))
                  .map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        disabled={linking}
                        onClick={() => handleLink(r.id)}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left text-sm hover:bg-default-100 transition-colors disabled:opacity-50"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {r.thumbnail_url && (
                            <img
                              src={`/api/proxy/image?url=${encodeURIComponent(r.thumbnail_url)}`}
                              className="w-8 h-8 rounded object-cover shrink-0"
                            />
                          )}
                          <span className="truncate font-medium">{r.title}</span>
                        </div>
                        <span className="text-xs text-primary shrink-0 font-semibold">Add</span>
                      </button>
                    </li>
                  ))}
                {personalRecipes.filter((r) => r.title.toLowerCase().includes(librarySearch.toLowerCase())).length === 0 && (
                  <li className="text-sm text-default-400 px-3 py-2">No matches</li>
                )}
              </ul>
              <div className="flex items-center gap-2 text-xs text-default-400 pt-1">
                <div className="flex-1 h-px bg-divider" />
                <span>or import from URL</span>
                <div className="flex-1 h-px bg-divider" />
              </div>
            </div>
          )}

          {!parsed && (
            <form id="import-form" onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div className="flex gap-1.5 flex-wrap">
                {[
                  { label: "Web", icon: "🌐" },
                  { label: "Instagram", icon: "📸" },
                  { label: "TikTok", icon: "🎵" },
                ].map(({ label, icon }) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-default-100 text-default-500"
                  >
                    {icon} {label}
                  </span>
                ))}
              </div>
              <div className="flex gap-2 items-end">
                <Input
                  label="Recipe URL"
                  placeholder="Instagram, TikTok, or any recipe page URL"
                  type="url"
                  value={url}
                  onValueChange={setUrl}
                  isRequired
                  className="flex-1"
                />
                <Button type="button" variant="flat" onPress={handlePaste} className="shrink-0 mb-0.5">
                  Paste
                </Button>
              </div>
            </form>
          )}

          <ProgressList steps={progressSteps} />

          {error && (
            <div className="bg-danger-50 text-danger rounded-lg p-3 text-sm mt-2">
              <strong>Import failed</strong>
              <p className="mt-1">{error}</p>
            </div>
          )}

          {editable && (
            <EditableRecipeView
              recipe={editable}
              selectedTags={selectedTags}
              allTags={allTags}
              onChange={setEditable}
              onTagAdd={(tag) => setSelectedTags((prev) => [...prev, tag])}
              onTagRemove={(id) => setSelectedTags((prev) => prev.filter((t) => t.id !== id))}
              onTagCreate={handleTagCreate}
            />
          )}
        </ModalBody>
        <ModalFooter className="flex flex-col gap-2 items-stretch">
          {parsed && activeHouseholdId && (
            <div className="flex items-center justify-between px-1">
              <span className="text-sm text-default-600">Also add to my private recipes</span>
              <Switch
                size="sm"
                isSelected={sharedToPersonal}
                onValueChange={setSharedToPersonal}
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="light" onPress={handleClose} isDisabled={loading || saving}>
              {parsed ? "Discard" : "Cancel"}
            </Button>
            {parsed ? (
              <Button color="primary" onPress={handleSave} isLoading={saving}>
                Save
              </Button>
            ) : (
              <Button color="primary" type="submit" form="import-form" isLoading={loading}>
                Import
              </Button>
            )}
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
