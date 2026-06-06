import { useEffect, useState } from "react";
import { ToastProvider } from "@heroui/react";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import BottomNav from "./components/BottomNav";
import AddRecipeModal from "./components/AddRecipeModal";
import ProtectedRoute from "./components/ProtectedRoute";
import RecipesPage from "./pages/RecipesPage";
import MealPlanPage from "./pages/MealPlanPage";
import ShoppingListPage from "./pages/ShoppingListPage";
import SettingsPage from "./pages/SettingsPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import { AuthProvider } from "./context/AuthContext";
import { fetchStats, getPreferences, listRecipes, listTags, RecipeOut, RecipeStats, Tag, UserPreferences } from "./api/client";

function AppShell() {
  const [modalOpen, setModalOpen] = useState(false);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [recipes, setRecipes] = useState<RecipeOut[]>([]);
  const [recipesLoading, setRecipesLoading] = useState(true);
  const [stats, setStats] = useState<RecipeStats | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    listTags().then(setAllTags).catch(() => {});
    fetchStats().then(setStats).catch(() => null);
    getPreferences().then(setPreferences).catch(() => null);
    setRecipesLoading(true);
    listRecipes().then(setRecipes).finally(() => setRecipesLoading(false));
  }, []);

  function handleTagCreated(tag: Tag) {
    setAllTags((prev) => [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)));
  }

  function handleRecipeUpdated(updated: RecipeOut) {
    setRecipes((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }

  function handleRecipeDeleted(id: string) {
    setRecipes((prev) => prev.filter((r) => r.id !== id));
    fetchStats().then(setStats).catch(() => null);
  }

  function handleRecipeSaved() {
    listRecipes().then(setRecipes).catch(() => null);
    fetchStats().then(setStats).catch(() => null);
  }

  function handleStatsRefresh() {
    fetchStats().then(setStats).catch(() => null);
  }

  function openAddRecipe() {
    navigate("/");
    setModalOpen(true);
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
        <Routes>
          <Route
            path="/"
            element={
              <RecipesPage
                onAddRecipe={openAddRecipe}
                recipes={recipes}
                loading={recipesLoading}
                allTags={allTags}
                onTagCreated={handleTagCreated}
                onRecipeUpdated={handleRecipeUpdated}
                onRecipeDeleted={handleRecipeDeleted}
              />
            }
          />
          <Route path="/plan" element={<MealPlanPage recipes={recipes} preferences={preferences} />} />
          <Route path="/shopping" element={<ShoppingListPage />} />
          <Route
            path="/settings"
            element={<SettingsPage stats={stats} onStatsRefresh={handleStatsRefresh} preferences={preferences} onPreferencesChange={setPreferences} />}
          />
        </Routes>
      </div>
      <BottomNav onAddRecipe={openAddRecipe} />
      <AddRecipeModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={handleRecipeSaved}
        allTags={allTags}
        onTagCreated={handleTagCreated}
      />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider placement="bottom-center" />
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
