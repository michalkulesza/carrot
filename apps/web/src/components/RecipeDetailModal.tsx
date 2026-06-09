import { useEffect, useRef, useState } from "react";
import {
  Modal,
  ModalBackdrop,
  ModalContainer,
  ModalDialog,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Switch,
  toast,
} from "@heroui/react";
import {
  AllergenFlag,
  RecipeOut,
  SaveComponent,
  Tag,
  addTagToRecipe,
  createTag,
  deleteRecipe,
  removeTagFromRecipe,
  updateRecipe,
} from "../api/client";
import TagRow from "./TagRow";
import { useHousehold } from "../context/HouseholdContext";

// ── Allergen popover ──────────────────────────────────────────────────────────

function AllergenPopover({
  flag,
  activeAllergens,
  onReplace,
  onRestore,
}: {
  flag: AllergenFlag;
  activeAllergens: string[];
  onReplace: () => void;
  onRestore: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const [pos, setPos] = useState({ vertical: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    function handleScroll() { setOpen(false); }
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleScroll, { capture: true });
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScroll, { capture: true });
    };
  }, [open]);

  const isActive = flag.allergen && activeAllergens.some((a) => {
    const fa = flag.allergen!.toLowerCase();
    const la = a.toLowerCase();
    return fa === la || fa.includes(la) || la.includes(fa);
  });
  if (!isActive) return null;

  function handleOpen() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const showAbove = r.top > window.innerHeight / 2;
      setAbove(showAbove);
      setPos({
        vertical: showAbove ? window.innerHeight - r.top + 4 : r.bottom + 4,
        right: window.innerWidth - r.right,
      });
    }
    setOpen((v) => !v);
  }

  const panelStyle: React.CSSProperties = {
    position: "fixed",
    right: pos.right,
    zIndex: 9999,
    ...(above ? { bottom: pos.vertical } : { top: pos.vertical }),
  };

  return (
    <div className="shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        className={`flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-medium whitespace-nowrap ${
          flag.substitute_applied
            ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
            : "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
        }`}
        title={flag.substitute_applied ? "Substitute applied" : `Contains ${flag.allergen}`}
      >
        {flag.substitute_applied ? "✓" : `⚠ ${flag.allergen}`}
      </button>
      {open && (
        <div
          ref={panelRef}
          style={panelStyle}
          className="bg-white border border-zinc-200 rounded-xl shadow-lg p-3 min-w-[220px] max-w-[330px] text-sm"
        >
          {flag.substitute_applied && flag.original_display ? (
            <>
              <p className="text-zinc-600 mb-2">
                Originally <strong className="text-zinc-800">{flag.original_display}</strong>,
                replaced with <strong className="text-zinc-800">{flag.substitute}</strong> due to {flag.allergen}.
              </p>
              <Button size="sm" variant="secondary" onPress={() => { onRestore(); setOpen(false); }}>
                Restore original
              </Button>
            </>
          ) : flag.substitute ? (
            <>
              <p className="text-zinc-600 mb-2">
                Contains <strong className="text-zinc-800">{flag.allergen}</strong>.
                Suggested substitute: <strong className="text-zinc-800">{flag.substitute}</strong>.
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="primary" onPress={() => { onReplace(); setOpen(false); }}>
                  Replace
                </Button>
                <Button size="sm" variant="tertiary" onPress={() => setOpen(false)}>
                  Keep original
                </Button>
              </div>
            </>
          ) : (
            <p className="text-zinc-600">
              Contains <strong className="text-zinc-800">{flag.allergen}</strong>. No substitute available.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── EditLine ──────────────────────────────────────────────────────────────────

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
    "w-full bg-transparent border-b border-transparent hover:border-zinc-300 focus:border-primary focus:outline-none transition-colors resize-none";
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

// ── Types ─────────────────────────────────────────────────────────────────────

type Mode = "view" | "editing" | "confirming";

interface EditState {
  title: string;
  servings: string;
  kcal: string;
  thumbnail_url: string | null;
  components: SaveComponent[];
  shared_to_personal: boolean;
}

function toEditState(r: RecipeOut): EditState {
  return {
    title: r.title,
    servings: r.servings?.toString() ?? "",
    kcal: r.kcal_per_serving?.toString() ?? "",
    thumbnail_url: r.thumbnail_url,
    components: (r.components as SaveComponent[]).map((c) => ({
      ...c,
      ingredients: [...c.ingredients],
      steps: [...c.steps],
      ingredient_flags: c.ingredient_flags ? [...c.ingredient_flags] : undefined,
    })),
    shared_to_personal: r.shared_to_personal ?? true,
  };
}

// ── View: component section ───────────────────────────────────────────────────

function ViewComponent({
  comp,
  single,
  activeAllergens,
  onReplaceIngredient,
  onRestoreIngredient,
}: {
  comp: SaveComponent;
  single: boolean;
  activeAllergens: string[];
  onReplaceIngredient: (ii: number) => void;
  onRestoreIngredient: (ii: number) => void;
}) {
  return (
    <div className="mb-5">
      {!single && (
        <h3 className="text-sm font-semibold text-zinc-600 mb-2">{comp.name}</h3>
      )}
      {comp.ingredients.length > 0 && (
        <>
          <p className="text-xs font-semibold uppercase text-zinc-400 mb-1">Ingredients</p>
          <ul className="space-y-1 mb-3">
            {comp.ingredients.map((ing, i) => {
              const flag = comp.ingredient_flags?.[i];
              return (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-zinc-300 mt-1 shrink-0">·</span>
                  <span className="flex-1">{ing}</span>
                  {flag && (
                    <AllergenPopover
                      flag={flag}
                      activeAllergens={activeAllergens}
                      onReplace={() => onReplaceIngredient(i)}
                      onRestore={() => onRestoreIngredient(i)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {comp.steps.length > 0 && (
        <>
          <p className="text-xs font-semibold uppercase text-zinc-400 mb-1">Steps</p>
          <ol className="space-y-2">
            {comp.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="text-zinc-400 font-medium shrink-0">{i + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

// ── Edit: component section ───────────────────────────────────────────────────

function EditComponent({
  comp,
  single,
  onIngredientChange,
  onStepChange,
}: {
  comp: SaveComponent;
  single: boolean;
  onIngredientChange: (ii: number, val: string) => void;
  onStepChange: (si: number, val: string) => void;
}) {
  return (
    <div className="mb-5">
      {!single && (
        <h3 className="text-sm font-semibold text-zinc-600 mb-2">{comp.name}</h3>
      )}
      {comp.ingredients.length > 0 && (
        <>
          <p className="text-xs font-semibold uppercase text-zinc-400 mb-1">Ingredients</p>
          <ul className="space-y-1 mb-3">
            {comp.ingredients.map((ing, ii) => (
              <li key={ii} className="flex items-start gap-2 text-sm">
                <span className="text-zinc-300 mt-1.5 shrink-0">·</span>
                <EditLine value={ing} onChange={(v) => onIngredientChange(ii, v)} />
              </li>
            ))}
          </ul>
        </>
      )}
      {comp.steps.length > 0 && (
        <>
          <p className="text-xs font-semibold uppercase text-zinc-400 mb-1">Steps</p>
          <ol className="space-y-2">
            {comp.steps.map((step, si) => (
              <li key={si} className="flex items-start gap-2 text-sm">
                <span className="text-zinc-400 font-medium shrink-0">{si + 1}.</span>
                <EditLine value={step} onChange={(v) => onStepChange(si, v)} multiline />
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface RecipeDetailModalProps {
  recipe: RecipeOut | null;
  allTags: Tag[];
  onTagCreated: (tag: Tag) => void;
  onClose: () => void;
  onUpdated?: (r: RecipeOut) => void;
  onDeleted?: (id: string) => void;
  initialMode?: Mode;
  activeAllergens?: string[];
}

export default function RecipeDetailModal({
  recipe,
  allTags,
  onTagCreated,
  onClose,
  onUpdated,
  onDeleted,
  initialMode,
  activeAllergens = [],
}: RecipeDetailModalProps) {
  const { activeHouseholdId } = useHousehold();
  const [mode, setMode] = useState<Mode>("view");
  const [draft, setDraft] = useState<EditState | null>(null);
  const [localTags, setLocalTags] = useState<Tag[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showImgInput, setShowImgInput] = useState(false);
  const [imgDraft, setImgDraft] = useState("");
  const initialModeRef = useRef(initialMode);
  initialModeRef.current = initialMode;

  useEffect(() => {
    if (recipe) {
      setDraft(toEditState(recipe));
      setLocalTags(recipe.tags ?? []);
      setMode(initialModeRef.current ?? "view");
      setError(null);
    }
  }, [recipe?.id]);

  if (!recipe || !draft) return null;
  const r = recipe;

  const displayThumb = mode === "editing" ? draft.thumbnail_url : r.thumbnail_url;
  const proxyUrl = displayThumb
    ? `/api/proxy/image?url=${encodeURIComponent(displayThumb)}`
    : null;

  function openImgEditor() {
    setImgDraft(draft?.thumbnail_url ?? "");
    setShowImgInput(true);
  }

  function commitImg() {
    const trimmed = imgDraft.trim();
    setDraft((d) => (d ? { ...d, thumbnail_url: trimmed || null } : d));
    setShowImgInput(false);
  }

  const components = mode === "editing" ? draft.components : (r.components as SaveComponent[]);
  const single = components.length === 1;

  const headerBg =
    mode === "editing"
      ? "bg-warning-100 transition-colors duration-200"
      : mode === "confirming"
      ? "bg-danger-100 transition-colors duration-200"
      : "transition-colors duration-200";

  function setIngredient(ci: number, ii: number, val: string) {
    setDraft((d) => {
      if (!d) return d;
      const comps = d.components.map((c, ci2) =>
        ci2 !== ci
          ? c
          : { ...c, ingredients: c.ingredients.map((v, ii2) => (ii2 === ii ? val : v)) }
      );
      return { ...d, components: comps };
    });
  }

  function setStep(ci: number, si: number, val: string) {
    setDraft((d) => {
      if (!d) return d;
      const comps = d.components.map((c, ci2) =>
        ci2 !== ci ? c : { ...c, steps: c.steps.map((s, si2) => (si2 === si ? val : s)) }
      );
      return { ...d, components: comps };
    });
  }

  async function handleTagAdd(tag: Tag) {
    setLocalTags((prev) => [...prev, tag]);
    try {
      await addTagToRecipe(r.id, tag.id);
    } catch {
      setLocalTags((prev) => prev.filter((t) => t.id !== tag.id));
    }
  }

  async function handleTagRemove(tagId: string) {
    setLocalTags((prev) => prev.filter((t) => t.id !== tagId));
    try {
      await removeTagFromRecipe(r.id, tagId);
    } catch {
      const removed = allTags.find((t) => t.id === tagId);
      if (removed) setLocalTags((prev) => [...prev, removed]);
    }
  }

  async function handleTagCreate(name: string): Promise<Tag> {
    const tag = await createTag(name);
    onTagCreated(tag);
    return tag;
  }

  async function handleSave() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateRecipe(r.id, {
        title: draft.title,
        servings: draft.servings !== "" ? Number(draft.servings) : null,
        kcal_per_serving: draft.kcal !== "" ? Number(draft.kcal) : null,
        thumbnail_url: draft.thumbnail_url,
        creator_handle: r.creator_handle,
        source_url: r.source_url,
        components: draft.components,
        tag_ids: localTags.map((t) => t.id),
        shared_to_personal: draft.shared_to_personal,
      });
      toast.success("Recipe updated", { timeout: 3000 });
      onUpdated?.(updated);
      setMode("view");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function handleReplaceIngredient(ci: number, ii: number) {
    const comp = (r.components as SaveComponent[])[ci];
    const flag = comp.ingredient_flags?.[ii];
    if (!flag?.substitute) return;
    const originalDisplay = comp.ingredients[ii];

    const newComponents = (r.components as SaveComponent[]).map((c, cIdx) => {
      if (cIdx !== ci) return c;
      const newIngredients = c.ingredients.map((ing, iIdx) =>
        iIdx === ii ? flag.substitute! : ing
      );
      const newFlags = (c.ingredient_flags ?? []).map((f, fIdx) =>
        fIdx === ii
          ? { ...f, substitute_applied: true, original_display: originalDisplay }
          : f
      );
      return { ...c, ingredients: newIngredients, ingredient_flags: newFlags };
    });

    try {
      const updated = await updateRecipe(r.id, {
        title: r.title,
        servings: r.servings,
        kcal_per_serving: r.kcal_per_serving,
        thumbnail_url: r.thumbnail_url,
        creator_handle: r.creator_handle,
        source_url: r.source_url,
        components: newComponents,
        tag_ids: localTags.map((t) => t.id),
        shared_to_personal: r.shared_to_personal,
      });
      onUpdated?.(updated);
      setDraft(toEditState(updated));
    } catch (err) {
      toast.danger(err instanceof Error ? err.message : "Failed to apply substitute", { timeout: 3000 });
    }
  }

  async function handleRestoreIngredient(ci: number, ii: number) {
    const comp = (r.components as SaveComponent[])[ci];
    const flag = comp.ingredient_flags?.[ii];
    if (!flag?.original_display) return;
    const originalDisplay = flag.original_display;

    const newComponents = (r.components as SaveComponent[]).map((c, cIdx) => {
      if (cIdx !== ci) return c;
      const newIngredients = c.ingredients.map((ing, iIdx) =>
        iIdx === ii ? originalDisplay : ing
      );
      const newFlags = (c.ingredient_flags ?? []).map((f, fIdx) =>
        fIdx === ii
          ? { ...f, substitute_applied: false, original_display: null }
          : f
      );
      return { ...c, ingredients: newIngredients, ingredient_flags: newFlags };
    });

    try {
      const updated = await updateRecipe(r.id, {
        title: r.title,
        servings: r.servings,
        kcal_per_serving: r.kcal_per_serving,
        thumbnail_url: r.thumbnail_url,
        creator_handle: r.creator_handle,
        source_url: r.source_url,
        components: newComponents,
        tag_ids: localTags.map((t) => t.id),
        shared_to_personal: r.shared_to_personal,
      });
      onUpdated?.(updated);
      setDraft(toEditState(updated));
    } catch (err) {
      toast.danger(err instanceof Error ? err.message : "Failed to restore ingredient", { timeout: 3000 });
    }
  }

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      await deleteRecipe(r.id);
      toast.danger("Recipe deleted", { timeout: 3000 });
      onDeleted?.(r.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
      setMode("view");
    } finally {
      setBusy(false);
    }
  }

  function cancelMode() {
    if (mode === "editing") setDraft(toEditState(r));
    setMode("view");
    setShowImgInput(false);
    setError(null);
  }

  function handleClose() {
    setMode("view");
    setError(null);
    onClose();
  }

  return (
    <Modal isOpen={!!recipe} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <ModalBackdrop isDismissable>
        <ModalContainer size="lg" scroll="inside" className="!rounded-xl overflow-hidden">
          <ModalDialog className="!p-0 max-h-[calc(100dvh-2rem)] sm:max-h-[700px]">
            {/* ── Sticky header ── */}
            <ModalHeader className="flex-col gap-0 p-0">

              {/* Hero image (or solid colour in edit/confirm mode) */}
              {proxyUrl ? (
                <div className="relative w-full h-48 shrink-0">
                  <img src={proxyUrl} alt={r.title} className="absolute inset-0 w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />

                  {/* Edit-image button (editing only) */}
                  {mode === "editing" && (
                    <button
                      type="button"
                      onClick={openImgEditor}
                      className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/40 text-white text-xs font-semibold hover:bg-black/60 transition-colors backdrop-blur-sm"
                    >
                      Edit image
                    </button>
                  )}

                  {/* Title + author over gradient */}
                  <div className="absolute bottom-0 inset-x-0 px-5 pb-4 pt-8">
                    {mode === "editing" ? (
                      <EditLine
                        value={draft.title}
                        onChange={(v) => setDraft((d) => (d ? { ...d, title: v } : d))}
                        className="text-xl font-bold text-white leading-snug placeholder:text-white/50"
                        multiline
                      />
                    ) : (
                      <h2 className="text-xl font-bold text-white leading-snug">{r.title}</h2>
                    )}
                    {r.creator_handle && (
                      <p className="text-sm text-white/75 mt-0.5">@{r.creator_handle}</p>
                    )}
                    {r.household_id && r.added_by && (
                      <p className="text-xs text-white/60 mt-0.5">Added by {r.added_by}</p>
                    )}
                  </div>
                </div>
              ) : (
                /* No image: plain title block */
                <div className={`px-5 pt-5 pb-1 ${headerBg}`}>
                  {mode === "editing" ? (
                    <EditLine
                      value={draft.title}
                      onChange={(v) => setDraft((d) => (d ? { ...d, title: v } : d))}
                      className="text-xl font-bold leading-snug"
                      multiline
                    />
                  ) : (
                    <h2 className="text-xl font-bold leading-snug">{r.title}</h2>
                  )}
                  {r.creator_handle && (
                    <p className="text-sm text-zinc-500 mt-0.5">@{r.creator_handle}</p>
                  )}
                  {r.household_id && r.added_by && (
                    <p className="text-xs text-zinc-400 mt-0.5">Added by {r.added_by}</p>
                  )}
                </div>
              )}

              {/* Image URL input */}
              {mode === "editing" && showImgInput && (
                <div className={`px-5 pt-2 ${headerBg}`}>
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
                    className="w-full text-sm border-b border-primary focus:outline-none bg-transparent"
                  />
                </div>
              )}

              {/* Metadata: tags, pills, actions */}
              <div className={`px-5 pt-3 pb-3 flex flex-col gap-2 ${headerBg}`}>

              {/* Tags — always visible */}
              <TagRow
                tags={localTags}
                allTags={allTags}
                onAdd={handleTagAdd}
                onRemove={handleTagRemove}
                onCreateTag={handleTagCreate}
              />

              {/* Serves / kcal pills */}
              {(draft.servings !== "" || draft.kcal !== "" || r.servings != null || r.kcal_per_serving != null) && (
                <div className="flex gap-2">
                  {mode === "editing" ? (
                    <>
                      <label className="flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-medium pl-3 pr-2 py-1.5 rounded-full cursor-text">
                        <span>Serves</span>
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={draft.servings}
                          onChange={(e) =>
                            setDraft((d) =>
                              d ? { ...d, servings: String(Math.min(99, Math.max(1, Number(e.target.value)))) } : d
                            )
                          }
                          className="w-[2.2ch] bg-transparent text-primary font-semibold text-xs text-center focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                      </label>
                      <label className="flex items-center gap-1.5 bg-warning/10 text-warning-700 text-xs font-medium pl-2 pr-3 py-1.5 rounded-full cursor-text">
                        <input
                          type="number"
                          min={1}
                          max={9999}
                          value={draft.kcal}
                          onChange={(e) =>
                            setDraft((d) =>
                              d ? { ...d, kcal: String(Math.min(9999, Math.max(1, Number(e.target.value)))) } : d
                            )
                          }
                          className="w-[3.8ch] bg-transparent text-warning-700 font-semibold text-xs text-center focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                        <span>kcal / serving</span>
                      </label>
                    </>
                  ) : (
                    <>
                      {r.servings != null && (
                        <span className="text-xs text-primary font-medium bg-primary/10 px-3 py-1.5 rounded-full">
                          Serves {r.servings}
                        </span>
                      )}
                      {r.kcal_per_serving != null && (
                        <span className="text-xs text-warning-700 font-medium bg-warning/10 px-3 py-1.5 rounded-full">
                          {r.kcal_per_serving} kcal / serving
                        </span>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Action bar */}
              {mode === "view" && (
                <div className="flex gap-2 pt-0.5 items-center">
                  <Button size="sm" variant="secondary" onPress={() => setMode("editing")}>
                    Edit
                  </Button>
                  <Button size="sm" variant="danger-soft" onPress={() => setMode("confirming")}>
                    Remove
                  </Button>
                  {r.source_url && (
                    <a
                      href={r.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center px-3 py-1 text-xs font-medium rounded-lg bg-zinc-100 hover:bg-zinc-200 transition-colors"
                    >
                      Source
                    </a>
                  )}
                </div>
              )}
              {mode === "editing" && (
                <div className="flex items-center gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={cancelMode}
                    className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-warning text-warning-foreground hover:bg-warning-400 transition-colors"
                  >
                    ✎ Editing — tap to cancel
                  </button>
                </div>
              )}
              {mode === "confirming" && (
                <div className="flex items-center gap-2 pt-0.5">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-danger text-danger-foreground">
                    Delete this recipe?
                  </span>
                </div>
              )}
              </div>{/* end metadata block */}
            </ModalHeader>

            {/* ── Scrollable body ── */}
            <ModalBody className="!px-5 !pb-5 !pt-0">
              {error && (
                <div className="bg-danger-50 text-danger rounded-lg p-3 text-sm mb-3">
                  {error}
                </div>
              )}

              {mode === "editing"
                ? components.map((comp, ci) => (
                    <EditComponent
                      key={ci}
                      comp={comp}
                      single={single}
                      onIngredientChange={(ii, val) => setIngredient(ci, ii, val)}
                      onStepChange={(si, val) => setStep(ci, si, val)}
                    />
                  ))
                : components.map((comp, ci) => (
                    <ViewComponent
                      key={ci}
                      comp={comp as SaveComponent}
                      single={single}
                      activeAllergens={activeAllergens}
                      onReplaceIngredient={(ii) => handleReplaceIngredient(ci, ii)}
                      onRestoreIngredient={(ii) => handleRestoreIngredient(ci, ii)}
                    />
                  ))}
            </ModalBody>

            <ModalFooter className="flex-col gap-2 items-stretch px-5 pb-5 pt-3">
              {mode === "editing" && r.household_id && (
                <div className="flex items-center justify-between px-1">
                  <span className="text-sm text-zinc-600">Also in my private recipes</span>
                  <Switch
                    size="sm"
                    isSelected={draft?.shared_to_personal ?? true}
                    onChange={(v) => setDraft((d) => d ? { ...d, shared_to_personal: v } : d)}
                  >
                    <Switch.Control><Switch.Thumb /></Switch.Control>
                  </Switch>
                </div>
              )}
              <div className="flex justify-end gap-2">
              {mode === "editing" && (
                <>
                  <Button variant="tertiary" onPress={cancelMode} isDisabled={busy}>Cancel</Button>
                  <Button variant="primary" onPress={handleSave} isDisabled={busy}>Save</Button>
                </>
              )}
              {mode === "confirming" && (
                <>
                  <Button variant="tertiary" onPress={cancelMode} isDisabled={busy}>Cancel</Button>
                  <Button variant="danger" onPress={handleDelete} isDisabled={busy}>Delete</Button>
                </>
              )}
              {mode === "view" && (
                <Button variant="tertiary" onPress={handleClose}>Close</Button>
              )}
              </div>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}
