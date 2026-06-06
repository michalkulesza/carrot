import { useEffect, useRef, useState } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  addToast,
} from "@heroui/react";
import { RecipeOut, SaveComponent, deleteRecipe, updateRecipe } from "../api/client";

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

// ── Types ─────────────────────────────────────────────────────────────────────

type Mode = "view" | "editing" | "confirming";

interface EditState {
  title: string;
  servings: string;
  kcal: string;
  thumbnail_url: string | null;
  components: SaveComponent[];
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
    })),
  };
}

// ── View: component section ───────────────────────────────────────────────────

function ViewComponent({ comp, single }: { comp: SaveComponent; single: boolean }) {
  return (
    <div className="mb-5">
      {!single && (
        <h3 className="text-sm font-semibold text-default-600 mb-2">{comp.name}</h3>
      )}
      {comp.ingredients.length > 0 && (
        <>
          <p className="text-xs font-semibold uppercase text-default-400 mb-1">Ingredients</p>
          <ul className="space-y-1 mb-3">
            {comp.ingredients.map((ing, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="text-default-300 mt-1 shrink-0">·</span>
                <span>{ing}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {comp.steps.length > 0 && (
        <>
          <p className="text-xs font-semibold uppercase text-default-400 mb-1">Steps</p>
          <ol className="space-y-2">
            {comp.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="text-default-400 font-medium shrink-0">{i + 1}.</span>
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
        <h3 className="text-sm font-semibold text-default-600 mb-2">{comp.name}</h3>
      )}
      {comp.ingredients.length > 0 && (
        <>
          <p className="text-xs font-semibold uppercase text-default-400 mb-1">Ingredients</p>
          <ul className="space-y-1 mb-3">
            {comp.ingredients.map((ing, ii) => (
              <li key={ii} className="flex items-start gap-2 text-sm">
                <span className="text-default-300 mt-1.5 shrink-0">·</span>
                <EditLine value={ing} onChange={(v) => onIngredientChange(ii, v)} />
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
  onClose: () => void;
  onUpdated?: (r: RecipeOut) => void;
  onDeleted?: (id: string) => void;
}

export default function RecipeDetailModal({
  recipe,
  onClose,
  onUpdated,
  onDeleted,
}: RecipeDetailModalProps) {
  const [mode, setMode] = useState<Mode>("view");
  const [draft, setDraft] = useState<EditState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showImgInput, setShowImgInput] = useState(false);
  const [imgDraft, setImgDraft] = useState("");

  useEffect(() => {
    if (recipe) {
      setDraft(toEditState(recipe));
      setMode("view");
      setError(null);
    }
  }, [recipe?.id]);

  if (!recipe || !draft) return null;
  const r = recipe; // narrowed non-null reference for closures

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
    setDraft((d) => d ? { ...d, thumbnail_url: trimmed || null } : d);
    setShowImgInput(false);
  }

  const components = mode === "editing" ? draft.components : (r.components as SaveComponent[]);
  const single = components.length === 1;

  // Header background per mode
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
        ci2 !== ci ? c : { ...c, ingredients: c.ingredients.map((v, ii2) => ii2 === ii ? val : v) }
      );
      return { ...d, components: comps };
    });
  }

  function setStep(ci: number, si: number, val: string) {
    setDraft((d) => {
      if (!d) return d;
      const comps = d.components.map((c, ci2) =>
        ci2 !== ci ? c : { ...c, steps: c.steps.map((s, si2) => si2 === si ? val : s) }
      );
      return { ...d, components: comps };
    });
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
        components: draft.components,
      });
      addToast({ title: "Recipe updated", color: "success", timeout: 3000 });
      onUpdated?.(updated);
      setMode("view");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      await deleteRecipe(r.id);
      addToast({ title: "Recipe deleted", color: "danger", timeout: 3000 });
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
    <Modal isOpen={!!recipe} onClose={handleClose} size="lg" scrollBehavior="inside">
      <ModalContent>
        {/* ── Sticky header ── */}
        <ModalHeader className={`flex-col gap-2 pb-3 ${headerBg}`}>

          {/* Title row */}
          <div className="flex gap-3 items-start w-full">
            {mode === "editing" ? (
              <button
                type="button"
                onClick={openImgEditor}
                className="relative w-14 h-14 rounded-lg shrink-0 overflow-hidden bg-default-100 group cursor-pointer"
              >
                {proxyUrl ? (
                  <img src={proxyUrl} alt={r.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-default-300 text-2xl">🖼</div>
                )}
                <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-white text-[10px] font-semibold uppercase tracking-wide">Edit</span>
                </div>
              </button>
            ) : (
              proxyUrl && (
                <img src={proxyUrl} alt={r.title} className="w-14 h-14 rounded-lg object-cover shrink-0" />
              )
            )}
            <div className="flex-1 min-w-0">
              {mode === "editing" ? (
                <EditLine
                  value={draft.title}
                  onChange={(v) => setDraft((d) => d ? { ...d, title: v } : d)}
                  className="text-base font-bold leading-snug"
                  multiline
                />
              ) : (
                <p className="font-bold text-base leading-snug">{r.title}</p>
              )}
              {r.creator_handle && (
                <p className="text-xs text-default-500 mt-0.5 font-normal">
                  @{r.creator_handle}
                </p>
              )}
            </div>
          </div>

          {/* Image URL input */}
          {mode === "editing" && showImgInput && (
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
              className="w-full text-sm border-b border-primary focus:outline-none bg-transparent font-normal"
            />
          )}

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
            <div className="flex gap-2 pt-0.5">
              <Button size="sm" variant="flat" onPress={() => setMode("editing")}>
                Edit
              </Button>
              <Button size="sm" variant="flat" color="danger" onPress={() => setMode("confirming")}>
                Remove
              </Button>
            </div>
          )}
          {mode === "editing" && (
            <div className="flex items-center gap-2 pt-0.5">
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-warning text-warning-foreground">
                ✎ Editing
              </span>
            </div>
          )}
          {mode === "confirming" && (
            <div className="flex items-center gap-2 pt-0.5">
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-danger text-danger-foreground">
                Delete this recipe?
              </span>
            </div>
          )}
        </ModalHeader>

        {/* ── Scrollable body ── */}
        <ModalBody>
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
                <ViewComponent key={ci} comp={comp as SaveComponent} single={single} />
              ))}
        </ModalBody>

        <ModalFooter>
          {mode === "editing" && (
            <>
              <Button variant="light" onPress={cancelMode} isDisabled={busy}>Cancel</Button>
              <Button color="primary" onPress={handleSave} isLoading={busy}>Save</Button>
            </>
          )}
          {mode === "confirming" && (
            <>
              <Button variant="light" onPress={cancelMode} isDisabled={busy}>Cancel</Button>
              <Button color="danger" onPress={handleDelete} isLoading={busy}>Delete</Button>
            </>
          )}
          {mode === "view" && (
            <Button variant="light" onPress={handleClose}>Close</Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
