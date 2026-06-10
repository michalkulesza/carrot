import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Modal, ModalBackdrop, ModalBody, ModalContainer, ModalDialog, ModalFooter, ModalHeader, ToastProvider } from "@heroui/react";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import i18n from "./i18n";
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
import { TimerProvider, useTimers, formatCountdown, formatDurationLabel, type TimerEntry } from "./context/TimerContext";
import { NotificationHistoryProvider } from "./context/NotificationHistoryContext";
import { fetchStats, getPreferences, listRecipes, listTags, RecipeOut, RecipeStats, Tag, UserPreferences } from "./api/client";

function ExpiredTimersModal() {
  const { expiredQueue, dismissExpired } = useTimers();
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (expiredQueue.length === 0) return null;

  function goToStep(timer: TimerEntry) {
    dismissExpired();
    navigate(`/?recipe=${timer.recipeId}&step=${timer.componentIndex}-${timer.stepIndex}`);
  }

  return (
    <Modal isOpen onOpenChange={(open) => { if (!open) dismissExpired(); }}>
      <ModalBackdrop isDismissable>
        <ModalContainer size="sm" scroll="inside" className="!rounded-xl overflow-hidden">
          <ModalDialog className="max-h-[calc(100dvh-2rem)] sm:max-h-[600px]">
            <ModalHeader>
              {t("timers.timerDone", { count: expiredQueue.length })}
            </ModalHeader>
            <ModalBody className="flex flex-col gap-3">
              {expiredQueue.map((timer) => (
                <div key={timer.id} className="flex flex-col gap-2 rounded-xl bg-zinc-50 p-3">
                  <div className="flex items-start gap-2.5">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold mt-0.5">✓</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-zinc-800 leading-snug">{timer.recipeTitle}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {t("common.step")} {timer.stepIndex + 1} · {formatDurationLabel(timer.totalSeconds)}
                      </p>
                      <p className="text-xs text-zinc-400 mt-0.5 leading-snug line-clamp-2">{timer.stepText}</p>
                    </div>
                  </div>
                  <Button variant="secondary" size="sm" className="w-full" onPress={() => goToStep(timer)}>
                    {t("common.goToStep")}
                  </Button>
                </div>
              ))}
            </ModalBody>
            <ModalFooter>
              <Button variant="primary" onPress={dismissExpired}>{t("common.ok")}</Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}

function ResumeTimersModal() {
  const { resumeInfo, confirmResume, confirmClear } = useTimers();
  const { t } = useTranslation();
  if (!resumeInfo) return null;
  const { interrupted, expired } = resumeInfo;
  return (
    <Modal isOpen onOpenChange={(open) => { if (!open) confirmResume(); }}>
      <ModalBackdrop isDismissable>
        <ModalContainer size="sm" className="!rounded-xl overflow-hidden">
          <ModalDialog>
            <ModalHeader>{t("timers.running")}</ModalHeader>
            <ModalBody className="flex flex-col gap-4">
              {interrupted.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">{t("timers.resumedAutomatically")}</p>
                  {interrupted.map((timer) => (
                    <div key={timer.id} className="flex items-center justify-between text-sm text-zinc-600">
                      <span><span className="font-medium">{timer.recipeTitle}</span> — {t("common.step")} {timer.stepIndex + 1}</span>
                      <span className="font-mono text-xs tabular-nums text-zinc-400">{formatCountdown(timer.remainingAtStart)}</span>
                    </div>
                  ))}
                </div>
              )}
              {expired.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">{t("timers.finishedWhileAway")}</p>
                  {expired.map((timer) => (
                    <p key={timer.id} className="text-sm text-zinc-600">
                      <span className="font-medium">{timer.recipeTitle}</span> — {t("common.step")} {timer.stepIndex + 1}
                    </p>
                  ))}
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button variant="tertiary" onPress={confirmClear}>{t("common.clearAll")}</Button>
              <Button variant="primary" onPress={confirmResume}>{t("common.ok")}</Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}

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
    getPreferences().then((prefs) => {
      setPreferences(prefs);
      if (prefs.language) i18n.changeLanguage(prefs.language);
    }).catch(() => null);
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
    <NotificationHistoryProvider>
    <TimerProvider>
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
                    preferences={preferences}
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
          <svg width="20" height="20" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
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
          preferences={preferences}
        />
        <ResumeTimersModal />
        <ExpiredTimersModal />
      </div>
    </HouseholdProvider>
    </TimerProvider>
    </NotificationHistoryProvider>
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
