import { useCallback, useEffect, useState } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import i18n from '../i18n'
import BottomNav from './BottomNav'
import Sidebar from './Sidebar'
import AddRecipeModal from './AddRecipeModal'
import ResumeTimersModal from './ResumeTimersModal'
import ExpiredTimersModal from './ExpiredTimersModal'
import RecipesPage from '../pages/RecipesPage'
import MealPlanPage from '../pages/MealPlanPage'
import ShoppingListPage from '../pages/ShoppingListPage'
import SettingsPage from '../pages/SettingsPage'
import { useAuth } from '../context/AuthContext'
import { HouseholdProvider } from '../context/HouseholdContext'
import { TimerProvider } from '../context/TimerContext'
import { NotificationHistoryProvider } from '../context/NotificationHistoryContext'
import {
  fetchStats,
  getPreferences,
  listRecipes,
  listTags,
  type RecipeOut,
  type RecipeStats,
  type Tag,
  type UserPreferences,
} from '../api/client'

const AppShell = () => {
  const { user } = useAuth()
  const [modalOpen, setModalOpen] = useState(false)
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [recipes, setRecipes] = useState<RecipeOut[]>([])
  const [recipesLoading, setRecipesLoading] = useState(true)
  const [stats, setStats] = useState<RecipeStats | null>(null)
  const [preferences, setPreferences] = useState<UserPreferences | null>(null)
  const navigate = useNavigate()

  const refetchAll = useCallback(() => {
    listTags()
      .then(setAllTags)
      .catch(() => {})
    fetchStats()
      .then(setStats)
      .catch(() => null)
    setRecipesLoading(true)
    listRecipes()
      .then(setRecipes)
      .finally(() => setRecipesLoading(false))
  }, [])

  useEffect(() => {
    refetchAll()
    getPreferences()
      .then(setPreferences)
      .catch(() => null)
  }, [user?.active_household_id, refetchAll])

  // Separate effect so preferences don't re-fetch on context switch
  useEffect(() => {
    getPreferences()
      .then((prefs) => {
        setPreferences(prefs)
        if (prefs.language) i18n.changeLanguage(prefs.language)
      })
      .catch(() => null)
  }, [])

  const handleContextSwitch = useCallback(() => {
    refetchAll()
  }, [refetchAll])

  const handleTagCreated = (tag: Tag) => {
    setAllTags((prev) =>
      [...prev, tag].sort((a, b) => a.name.localeCompare(b.name))
    )
  }

  const handleRecipeUpdated = (updated: RecipeOut) => {
    setRecipes((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
  }

  const handleRecipeDeleted = (id: string) => {
    setRecipes((prev) => prev.filter((r) => r.id !== id))
    fetchStats()
      .then(setStats)
      .catch(() => null)
  }

  const handleRecipeSaved = () => {
    listRecipes()
      .then(setRecipes)
      .catch(() => null)
    fetchStats()
      .then(setStats)
      .catch(() => null)
  }

  const handleStatsRefresh = () => {
    fetchStats()
      .then(setStats)
      .catch(() => null)
  }

  const openAddRecipe = useCallback(() => {
    navigate('/')
    setModalOpen(true)
  }, [navigate])

  const closeAddRecipe = () => setModalOpen(false)

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
                  <Route
                    path="/plan"
                    element={
                      <MealPlanPage
                        recipes={recipes}
                        preferences={preferences}
                        allTags={allTags}
                        onTagCreated={handleTagCreated}
                        onRecipeUpdated={handleRecipeUpdated}
                        onRecipeDeleted={handleRecipeDeleted}
                      />
                    }
                  />
                  <Route path="/shopping" element={<ShoppingListPage />} />
                  <Route
                    path="/settings"
                    element={
                      <SettingsPage
                        stats={stats}
                        onStatsRefresh={handleStatsRefresh}
                        preferences={preferences}
                        onPreferencesChange={setPreferences}
                      />
                    }
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
              <svg
                width="20"
                height="20"
                viewBox="0 0 22 22"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <line x1="11" y1="3" x2="11" y2="19" />
                <line x1="3" y1="11" x2="19" y2="11" />
              </svg>
            </button>

            <AddRecipeModal
              isOpen={modalOpen}
              onClose={closeAddRecipe}
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
  )
}

export default AppShell
