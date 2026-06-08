import { useCallback, useEffect, useState } from "react";
import { ToastProvider } from "@heroui/react";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import BottomNav from "./components/BottomNav";
import Sidebar from "./components/Sidebar";
import AddRecipeModal from "./components/AddRecipeModal";
import ProtectedRoute from "./components/ProtectedRoute";
import RecipesPage from "./pages/RecipesPage";
import MealPlanPage from "./pages/MealPlanPage";
import ShoppingListPage from "./pages/ShoppingListPage";
import SettingsPage from "./pages/SettingsPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { HouseholdProvider } from "./context/HouseholdContext";
import { fetchStats, getPreferences, listRecipes, listTags, RecipeOut, RecipeStats, Tag, UserPreferences } from "./api/client";

function AppShell() {
  const { user } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [recipes, setRecipes] = useState<RecipeOut[]>([]);
  const [recipesLoading, setRecipesLoading] = useState(true);
  const [stats, setStats] = useState<RecipeStats | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const navigate = useNavigate();

  function refetchAll() {
    listTags().then(setAllTags).catch(() => {});
    fetchStats().then(setStats).catch(() => null);
    setRecipesLoading(true);
    listRecipes().then(setRecipes).finally(() => setRecipesLoading(false));
  }

  useEffect(() => {
    refetchAll();
    getPreferences().then(setPreferences).catch(() => null);
  }, [user?.active_household_id]);

  // Separate effect so preferences don't re-fetch on context switch
  useEffect(() => {
    getPreferences().then(setPreferences).catch(() => null);
  }, []);

  const handleContextSwitch = useCallback(() => {
    refetchAll();
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
    <HouseholdProvider onContextSwitch={handleContextSwitch}>
      <div className="min-h-screen bg-background md:bg-zinc-100">
        {/* Centered max-width container — flex row on desktop, block on mobile */}
        <div className="md:max-w-7xl md:mx-auto md:flex md:min-h-screen">
          <Sidebar />
          <div className="flex-1 min-w-0 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0 md:bg-background md:my-2 md:mr-2 md:rounded-xl md:shadow-sm">
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
              <Route path="/plan" element={<MealPlanPage recipes={recipes} preferences={preferences} allTags={allTags} onTagCreated={handleTagCreated} onRecipeUpdated={handleRecipeUpdated} onRecipeDeleted={handleRecipeDeleted} />} />
              <Route path="/shopping" element={<ShoppingListPage />} />
              <Route
                path="/settings"
                element={<SettingsPage stats={stats} onStatsRefresh={handleStatsRefresh} preferences={preferences} onPreferencesChange={setPreferences} />}
              />
            </Routes>
          </div>
        </div>

        <BottomNav onAddRecipe={openAddRecipe} />

        {/* Desktop FAB — fixed bottom-right */}
        <button
          onClick={openAddRecipe}
          className="hidden md:flex fixed bottom-8 right-8 w-14 h-14 rounded-full bg-primary text-white shadow-xl items-center justify-center text-2xl hover:scale-105 active:scale-95 transition-transform z-40"
          aria-label="Add recipe"
        >
          <svg width="18" height="18" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="11" y1="3" x2="11" y2="19" />
            <line x1="3" y1="11" x2="19" y2="11" />
          </svg>
        </button>

        <AddRecipeModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onSaved={handleRecipeSaved}
          allTags={allTags}
          onTagCreated={handleTagCreated}
        />
      </div>
    </HouseholdProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider placement="bottom" />
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
