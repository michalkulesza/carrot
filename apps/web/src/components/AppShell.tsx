import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus } from 'react-feather'
import { Routes, Route, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
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
import { DebugModeProvider } from '../context/DebugModeContext'
import { useRecipes, useRecipeStats } from '@platekeeper/shared/hooks/useRecipes'
import { useTags } from '@platekeeper/shared/hooks/useTags'
import { usePreferences } from '@platekeeper/shared/hooks/usePreferences'
import type { RecipeOut, Tag, UserPreferences } from '@platekeeper/shared/types'

const AppShell = () => {
  const { user } = useAuth()
  const [modalOpen, setModalOpen] = useState(false)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { recipes, isLoading: recipesLoading } = useRecipes()
  const { tags: allTags } = useTags()
  const { data: statsData } = useRecipeStats()
  const stats = statsData ?? null
  const { preferences } = usePreferences()

  // Sync language from preferences on first load
  useEffect(() => {
    if (preferences?.language) void i18n.changeLanguage(preferences.language)
  }, [preferences?.language])

  // Invalidate all data when active household changes
  const prevHouseholdId = useRef(user?.active_household_id)
  useEffect(() => {
    if (prevHouseholdId.current === user?.active_household_id) return
    prevHouseholdId.current = user?.active_household_id
    void qc.invalidateQueries({ queryKey: ['recipes'] })
    void qc.invalidateQueries({ queryKey: ['tags'] })
    void qc.invalidateQueries({ queryKey: ['recipes', 'stats'] })
    void qc.invalidateQueries({ queryKey: ['preferences'] })
  }, [user?.active_household_id, qc])

  const handleTagCreated = useCallback((tag: Tag) => {
    qc.setQueryData<Tag[]>(['tags'], (old = []) =>
      [...old, tag].sort((a, b) => a.name.localeCompare(b.name))
    )
  }, [qc])

  const handleRecipeUpdated = useCallback((updated: RecipeOut) => {
    qc.setQueryData<RecipeOut[]>(['recipes'], (old = []) =>
      old.map((r) => (r.id === updated.id ? updated : r))
    )
  }, [qc])

  const handleRecipeDeleted = useCallback((id: string) => {
    qc.setQueryData<RecipeOut[]>(['recipes'], (old = []) =>
      old.filter((r) => r.id !== id)
    )
    void qc.invalidateQueries({ queryKey: ['recipes', 'stats'] })
  }, [qc])

  const handleRecipeSaved = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['recipes'] })
    void qc.invalidateQueries({ queryKey: ['recipes', 'stats'] })
  }, [qc])

  const handleStatsRefresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['recipes', 'stats'] })
  }, [qc])

  const handlePreferencesChange = useCallback((prefs: UserPreferences) => {
    qc.setQueryData(['preferences'], prefs)
  }, [qc])

  const openAddRecipe = useCallback(() => {
    navigate('/')
    setModalOpen(true)
  }, [navigate])

  const closeAddRecipe = () => setModalOpen(false)

  return (
    <NotificationHistoryProvider>
      <TimerProvider>
        <HouseholdProvider>
          <DebugModeProvider>
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
                        onPreferencesChange={handlePreferencesChange}
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
              <Plus size={20} strokeWidth={2.5} />
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
          </DebugModeProvider>
        </HouseholdProvider>
      </TimerProvider>
    </NotificationHistoryProvider>
  )
}

export default AppShell
