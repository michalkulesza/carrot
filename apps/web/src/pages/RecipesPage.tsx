import { useEffect, useState } from "react";
import PageHeader from "../components/PageHeader";
import RecipeDetailModal from "../components/RecipeDetailModal";
import { listRecipes, RecipeOut, Tag } from "../api/client";

interface RecipesPageProps {
  onAddRecipe: () => void;
  refreshKey?: number;
  allTags: Tag[];
  onTagCreated: (tag: Tag) => void;
}

function RecipeCard({
  recipe,
  onClick,
  onTagClick,
}: {
  recipe: RecipeOut;
  onClick: () => void;
  onTagClick: (tag: Tag) => void;
}) {
  const proxyUrl = recipe.thumbnail_url
    ? `/api/proxy/image?url=${encodeURIComponent(recipe.thumbnail_url)}`
    : null;

  return (
    <button
      onClick={onClick}
      className="flex gap-3 items-start p-3 rounded-xl bg-content1 shadow-sm w-full text-left active:opacity-70 transition-opacity"
    >
      {proxyUrl && (
        <img
          src={proxyUrl}
          alt={recipe.title}
          className="w-16 h-16 rounded-lg object-cover shrink-0"
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm leading-snug line-clamp-2">{recipe.title}</p>
        {recipe.creator_handle && (
          <p className="text-xs text-default-400 mt-0.5">@{recipe.creator_handle}</p>
        )}
        <div className="flex gap-2 mt-1.5 flex-wrap">
          {recipe.servings != null && (
            <span className="text-xs text-primary font-medium bg-primary/10 px-2 py-0.5 rounded-full">
              {recipe.servings} servings
            </span>
          )}
          {recipe.kcal_per_serving != null && (
            <span className="text-xs text-warning-700 font-medium bg-warning/10 px-2 py-0.5 rounded-full">
              {recipe.kcal_per_serving} kcal
            </span>
          )}
        </div>
        {recipe.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {recipe.tags.map((tag) => (
              <span
                key={tag.id}
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onTagClick(tag);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    onTagClick(tag);
                  }
                }}
                className="text-xs font-medium px-2 py-0.5 rounded-full bg-secondary/15 text-secondary-700 cursor-pointer hover:bg-secondary/25 transition-colors"
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

export default function RecipesPage({ onAddRecipe, refreshKey, allTags, onTagCreated }: RecipesPageProps) {
  const [recipes, setRecipes] = useState<RecipeOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<RecipeOut | null>(null);
  const [filterTag, setFilterTag] = useState<Tag | null>(null);

  const displayed = filterTag
    ? recipes.filter((r) => r.tags.some((t) => t.id === filterTag.id))
    : recipes;

  function handleUpdated(updated: RecipeOut) {
    setRecipes((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setSelected(updated);
  }

  function handleDeleted(id: string) {
    setRecipes((prev) => prev.filter((r) => r.id !== id));
    setSelected(null);
  }

  useEffect(() => {
    setLoading(true);
    listRecipes()
      .then(setRecipes)
      .finally(() => setLoading(false));
  }, [refreshKey]);

  return (
    <>
      <PageHeader title="Recipes" />

      {allTags.length > 0 && (
        <div className="flex gap-2 px-4 mt-3 overflow-x-auto pb-1 scrollbar-hide">
          {allTags.map((tag) => {
            const active = filterTag?.id === tag.id;
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => setFilterTag(active ? null : tag)}
                className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                  active
                    ? "bg-secondary text-white"
                    : "bg-default-100 text-default-600 hover:bg-default-200"
                }`}
              >
                {tag.name}
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-3 px-4 mt-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-default-100 animate-pulse" />
          ))}
        </div>
      ) : displayed.length === 0 && recipes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-default-400 px-4 text-center">
          <p className="text-lg">No recipes yet.</p>
          <p className="text-sm mt-1">
            Tap the{" "}
            <button onClick={onAddRecipe} className="text-primary font-medium">
              + Add
            </button>{" "}
            button to import one.
          </p>
        </div>
      ) : displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-default-400 px-4 text-center">
          <p className="text-lg">No recipes with this tag.</p>
          <button onClick={() => setFilterTag(null)} className="text-sm text-primary mt-1">
            Clear filter
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-4 mt-4">
          {displayed.map((r) => (
            <RecipeCard
              key={r.id}
              recipe={r}
              onClick={() => setSelected(r)}
              onTagClick={setFilterTag}
            />
          ))}
        </div>
      )}

      <RecipeDetailModal
        recipe={selected}
        allTags={allTags}
        onTagCreated={onTagCreated}
        onClose={() => setSelected(null)}
        onUpdated={handleUpdated}
        onDeleted={handleDeleted}
      />
    </>
  );
}
