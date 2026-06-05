import { useEffect, useState } from "react";
import PageHeader from "../components/PageHeader";
import { listRecipes, RecipeOut } from "../api/client";

interface RecipesPageProps {
  onAddRecipe: () => void;
  refreshKey?: number;
}

function RecipeCard({ recipe }: { recipe: RecipeOut }) {
  const proxyUrl = recipe.thumbnail_url
    ? `/api/proxy/image?url=${encodeURIComponent(recipe.thumbnail_url)}`
    : null;

  return (
    <div className="flex gap-3 items-start p-3 rounded-xl bg-content1 shadow-sm">
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
        <div className="flex gap-2 mt-1.5">
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
      </div>
    </div>
  );
}

export default function RecipesPage({ onAddRecipe, refreshKey }: RecipesPageProps) {
  const [recipes, setRecipes] = useState<RecipeOut[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    listRecipes()
      .then(setRecipes)
      .finally(() => setLoading(false));
  }, [refreshKey]);

  return (
    <>
      <PageHeader title="Recipes" />
      {loading ? (
        <div className="flex flex-col gap-3 px-4 mt-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-default-100 animate-pulse" />
          ))}
        </div>
      ) : recipes.length === 0 ? (
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
      ) : (
        <div className="flex flex-col gap-3 px-4 mt-4">
          {recipes.map((r) => (
            <RecipeCard key={r.id} recipe={r} />
          ))}
        </div>
      )}
    </>
  );
}
