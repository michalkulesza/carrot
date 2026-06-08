import { useState, useEffect, useRef } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { RecipeOut, reorderRecipes } from "../api/client";

type SortField = "title" | "servings" | "kcal_per_serving" | "creator_handle" | "added_by" | "created_at";
type SortDir = "asc" | "desc";
type Sort = { field: SortField; dir: SortDir } | null;

interface RecipesTableProps {
  recipes: RecipeOut[];
  showAddedBy: boolean;
  onView: (recipe: RecipeOut) => void;
  onEdit: (recipe: RecipeOut) => void;
  onDelete: (recipe: RecipeOut) => void;
}

function GripIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
      <circle cx="4" cy="3.5" r="1.2" />
      <circle cx="10" cy="3.5" r="1.2" />
      <circle cx="4" cy="7" r="1.2" />
      <circle cx="10" cy="7" r="1.2" />
      <circle cx="4" cy="10.5" r="1.2" />
      <circle cx="10" cy="10.5" r="1.2" />
    </svg>
  );
}

function SortIndicator({ field, sort }: { field: SortField; sort: Sort }) {
  if (!sort || sort.field !== field) {
    return <span className="ml-1 text-zinc-300 text-[10px]">↕</span>;
  }
  return (
    <span className="ml-1 text-primary text-[10px]">
      {sort.dir === "asc" ? "↑" : "↓"}
    </span>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ThumbCell({ url, title }: { url: string | null; title: string }) {
  const [loaded, setLoaded] = useState(false);
  const proxyUrl = url ? `/api/proxy/image?url=${encodeURIComponent(url)}` : null;
  return (
    <div className="w-12 h-12 rounded-lg overflow-hidden bg-zinc-100 shrink-0 relative">
      {!loaded && proxyUrl && <div className="absolute inset-0 animate-pulse bg-zinc-200" />}
      {proxyUrl ? (
        <img
          src={proxyUrl}
          alt={title}
          onLoad={() => setLoaded(true)}
          className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      ) : (
        <div className="w-full h-full bg-zinc-100 flex items-center justify-center text-zinc-300 text-lg">
          🍽
        </div>
      )}
    </div>
  );
}

function RowMenu({
  onView,
  onEdit,
  onDelete,
}: {
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative flex items-center justify-center">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors text-base leading-none"
        aria-label="Row actions"
      >
        ⋯
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-50 w-36 rounded-xl bg-white shadow-xl border border-zinc-100 py-1 overflow-hidden">
          <button
            className="w-full text-left px-4 py-2 text-sm hover:bg-zinc-50 transition-colors"
            onClick={(e) => { e.stopPropagation(); setOpen(false); onView(); }}
          >
            View
          </button>
          <button
            className="w-full text-left px-4 py-2 text-sm hover:bg-zinc-50 transition-colors"
            onClick={(e) => { e.stopPropagation(); setOpen(false); onEdit(); }}
          >
            Edit
          </button>
          <button
            className="w-full text-left px-4 py-2 text-sm text-danger hover:bg-danger-50 transition-colors"
            onClick={(e) => { e.stopPropagation(); setOpen(false); onDelete(); }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function SortableRow({
  recipe,
  showAddedBy,
  dragEnabled,
  cols,
  onView,
  onEdit,
  onDelete,
}: {
  recipe: RecipeOut;
  showAddedBy: boolean;
  dragEnabled: boolean;
  cols: string;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: recipe.id,
    disabled: !dragEnabled,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        gridTemplateColumns: cols,
      }}
      {...attributes}
      className={`grid items-center gap-2 px-2 py-2 border-b border-zinc-100 hover:bg-zinc-50 transition-colors cursor-pointer select-none ${isDragging ? "opacity-50 shadow-md z-10 relative bg-zinc-50" : ""}`}
      onClick={onView}
    >
      {/* Drag handle */}
      <div
        {...(dragEnabled ? listeners : {})}
        onClick={(e) => e.stopPropagation()}
        className={`flex items-center justify-center ${dragEnabled ? "cursor-grab active:cursor-grabbing text-zinc-300 hover:text-zinc-500" : "text-zinc-200 cursor-default"} transition-colors`}
      >
        <GripIcon />
      </div>

      {/* Thumbnail */}
      <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
        <ThumbCell url={recipe.thumbnail_url} title={recipe.title} />
      </div>

      {/* Title */}
      <div className="min-w-0">
        <p className="font-medium text-sm leading-snug line-clamp-2">{recipe.title}</p>
      </div>

      {/* Servings */}
      <div className="text-sm text-zinc-600 text-right tabular-nums pr-2">
        {recipe.servings != null ? recipe.servings : <span className="text-zinc-300">—</span>}
      </div>

      {/* Kcal */}
      <div className="text-sm text-zinc-600 text-right tabular-nums pr-2">
        {recipe.kcal_per_serving != null ? recipe.kcal_per_serving : <span className="text-zinc-300">—</span>}
      </div>

      {/* Author */}
      <div className="text-sm text-zinc-500 truncate">
        {recipe.creator_handle ? `@${recipe.creator_handle}` : <span className="text-zinc-300">—</span>}
      </div>

      {/* Added by (household only) */}
      {showAddedBy && (
        <div className="text-sm text-zinc-500 truncate">
          {recipe.added_by ?? <span className="text-zinc-300">—</span>}
        </div>
      )}

      {/* Added date */}
      <div className="text-xs text-zinc-400 whitespace-nowrap">
        {formatDate(recipe.created_at)}
      </div>

      {/* ⋯ menu */}
      <div onClick={(e) => e.stopPropagation()}>
        <RowMenu onView={onView} onEdit={onEdit} onDelete={onDelete} />
      </div>
    </div>
  );
}

function getSortValue(recipe: RecipeOut, field: SortField): string | number | null {
  switch (field) {
    case "title": return recipe.title.toLowerCase();
    case "servings": return recipe.servings;
    case "kcal_per_serving": return recipe.kcal_per_serving;
    case "creator_handle": return recipe.creator_handle?.toLowerCase() ?? null;
    case "added_by": return recipe.added_by?.toLowerCase() ?? null;
    case "created_at": return recipe.created_at;
  }
}

function applySortRows(rows: RecipeOut[], sort: Sort): RecipeOut[] {
  if (!sort) return rows;
  return [...rows].sort((a, b) => {
    const av = getSortValue(a, sort.field);
    const bv = getSortValue(b, sort.field);
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sort.dir === "asc" ? cmp : -cmp;
  });
}

export default function RecipesTable({
  recipes,
  showAddedBy,
  onView,
  onEdit,
  onDelete,
}: RecipesTableProps) {
  const [sort, setSort] = useState<Sort>({ field: "created_at", dir: "desc" });
  const [localRows, setLocalRows] = useState<RecipeOut[]>(recipes);

  useEffect(() => {
    setLocalRows((prev) => {
      const recipeMap = new Map(recipes.map((r) => [r.id, r]));
      const updated = prev
        .filter((r) => recipeMap.has(r.id))
        .map((r) => recipeMap.get(r.id)!);
      const prevIds = new Set(prev.map((r) => r.id));
      const newOnes = recipes.filter((r) => !prevIds.has(r.id));
      return [...newOnes, ...updated];
    });
  }, [recipes]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || sort !== null) return;
    setLocalRows((rows) => {
      const oldIndex = rows.findIndex((r) => r.id === active.id);
      const newIndex = rows.findIndex((r) => r.id === over.id);
      const reordered = arrayMove(rows, oldIndex, newIndex);
      reorderRecipes(reordered.map((r) => r.id)).catch(() => {});
      return reordered;
    });
  }

  function toggleSort(field: SortField) {
    setSort((prev) => {
      if (prev?.field === field) {
        return { field, dir: prev.dir === "asc" ? "desc" : "asc" };
      }
      return { field, dir: field === "created_at" ? "desc" : "asc" };
    });
  }

  const dragEnabled = sort === null;
  const displayed = applySortRows(localRows, sort);

  const cols = showAddedBy
    ? "2rem 3.5rem 1fr 4.5rem 4.5rem 8rem 8rem 6.5rem 2.5rem"
    : "2rem 3.5rem 1fr 4.5rem 4.5rem 8rem 6.5rem 2.5rem";

  function HeaderCell({
    label,
    field,
    align = "left",
  }: {
    label: string;
    field: SortField;
    align?: "left" | "right";
  }) {
    const active = sort?.field === field;
    return (
      <button
        type="button"
        onClick={() => toggleSort(field)}
        className={`flex items-center gap-0.5 text-xs font-semibold uppercase tracking-wide transition-colors whitespace-nowrap ${align === "right" ? "justify-end" : "justify-start"} ${active ? "text-zinc-700" : "text-zinc-400 hover:text-zinc-600"}`}
      >
        {label}
        <SortIndicator field={field} sort={sort} />
      </button>
    );
  }

  return (
    <div className="px-4 mt-4 pb-6">
      <div className="rounded-xl bg-white shadow-sm overflow-hidden border border-zinc-100">
        {/* Header row */}
        <div
          className="grid items-center gap-2 px-2 py-2.5 border-b-2 border-zinc-100 bg-zinc-50/80"
          style={{ gridTemplateColumns: cols }}
        >
          {/* drag-handle col — non-interactive header placeholder */}
          <div
            title={dragEnabled ? "Drag to reorder" : "Clear column sort to enable drag"}
            className="flex items-center justify-center text-zinc-300"
          >
            <GripIcon />
          </div>
          {/* thumb col */}
          <div />
          <HeaderCell label="Title" field="title" />
          <div className="flex justify-end">
            <HeaderCell label="Servings" field="servings" align="right" />
          </div>
          <div className="flex justify-end">
            <HeaderCell label="Kcal" field="kcal_per_serving" align="right" />
          </div>
          <HeaderCell label="Author" field="creator_handle" />
          {showAddedBy && <HeaderCell label="Added by" field="added_by" />}
          <HeaderCell label="Added" field="created_at" />
          {/* actions col */}
          <div />
        </div>

        {/* Sortable rows */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={displayed.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            {displayed.map((recipe) => (
              <SortableRow
                key={recipe.id}
                recipe={recipe}
                showAddedBy={showAddedBy}
                dragEnabled={dragEnabled}
                cols={cols}
                onView={() => onView(recipe)}
                onEdit={() => onEdit(recipe)}
                onDelete={() => onDelete(recipe)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
