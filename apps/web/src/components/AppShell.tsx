import { useCallback, useEffect, useRef } from 'react'
import { Plus } from 'react-feather'
import { AnimatePresence, useIsPresent } from 'framer-motion'
import {
  Routes,
  Route,
  useLocation,
  useNavigate,
  type Location,
} from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ModalContainer, ModalDialog, toast } from '@heroui/react'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import BottomNav from './BottomNav'
import PageTransition from './PageTransition'
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
import HouseholdGate from './HouseholdGate'
import { TimerProvider } from '../context/TimerContext'
import { NotificationHistoryProvider } from '../context/NotificationHistoryContext'
import {
  useRecipe,
  useRecipes,
  useRecipeStats,
} from '@carrot/shared/hooks/useRecipes'
import { useTags } from '@carrot/shared/hooks/useTags'
import { useHouseholds } from '@carrot/shared/hooks/useHouseholds'
import { usePreferences } from '@carrot/shared/hooks/usePreferences'
import { useImportJobs } from '@carrot/shared/hooks/useImportJobs'
import type {
  AllergenRecheckStatus,
  ImportJob,
  RecipeOut,
  Tag,
  UserPreferences,
} from '@carrot/shared/types'
import PublicRecipePage from '../pages/PublicRecipePage'
import { useHousehold } from '../context/HouseholdContext'
import RecipeDetailModal from './RecipeDetailModal'
import {
  RouteNavigationProvider,
  getRoutedBackground,
  useRouteNavigation,
} from '../routing/RouteNavigationContext'
import {
  addRecipePath,
  isRecipeId,
  parseImportMode,
  parseStep,
} from '../routing/routeState'
import { getActiveAllergens } from '../pages/RecipesPage/helpers'
import { getAllergenRecheckStatus } from '../api/client'
import Modal from './AnimatedModal'

const AddRecipeFab = ({ onAddRecipe }: { onAddRecipe: () => void }) => {
  const { t } = useTranslation()
  const { households } = useHousehold()
  if (households.length === 0) return null

  return (
    <button
      onClick={onAddRecipe}
      className="hidden md:flex fixed bottom-24 right-8 w-14 h-14 rounded-full bg-primary text-white shadow-xl items-center justify-center text-2xl hover:scale-105 active:scale-95 transition-transform z-40 cursor-pointer"
      aria-label={t('nav.addRecipe')}
    >
      <Plus size={20} strokeWidth={2.5} />
    </button>
  )
}

const PublicRecipeOverlay = ({
  onAdded,
  location,
}: {
  onAdded: (recipe: RecipeOut) => Promise<void>
  location: Location
}) => {
  const { households, activeHouseholdId } = useHousehold()
  const navigate = useNavigate()
  useEffect(() => {
    console.log('[PublicShare] authenticated recipe overlay mounted')
  }, [])

  return (
    <PublicRecipePage
      token={location.pathname.split('/')[2]}
      signedIn
      households={households}
      activeHouseholdId={activeHouseholdId}
      onAdded={onAdded}
      onClose={() => navigate('/')}
    />
  )
}

interface RecipeRouteOverlayProps {
  location: Location
  allTags: import('@carrot/shared/types').Tag[]
  recipes: RecipeOut[]
  onUpdated: (recipe: RecipeOut) => void
  onDeleted: (id: string) => void
}

const RecipeRouteOverlay = ({
  location,
  allTags,
  recipes,
  onUpdated,
  onDeleted,
}: RecipeRouteOverlayProps) => {
  const isPresent = useIsPresent()
  const navigate = useNavigate()
  const { activeHouseholdId, activeHousehold } = useHousehold()
  const { preferences } = usePreferences()
  const { openRelatedRecipe, openCookMode, closeCookMode, closeOverlay } =
    useRouteNavigation()
  const recipeId = location.pathname.split('/')[2] ?? null
  const validId = isRecipeId(recipeId) ? recipeId : null
  const initialRecipe = recipes.find((recipe) => recipe.id === validId)
  const {
    data: recipe,
    isLoading,
    isError,
    refetch,
  } = useRecipe(validId, activeHouseholdId ?? 'personal', initialRecipe)
  const step = parseStep(new URLSearchParams(location.search).get('step'))
  const initialMode = (location.state as { recipeMode?: 'editing' } | null)
    ?.recipeMode
  const activeAllergens = getActiveAllergens(activeHousehold, preferences)

  useEffect(() => {
    if (isPresent && location.hash && location.hash !== '#cook')
      navigate(`${location.pathname}${location.search}`, {
        replace: true,
        state: location.state,
      })
  }, [
    location.hash,
    location.pathname,
    location.search,
    location.state,
    navigate,
    isPresent,
  ])
  useEffect(() => {
    if (!isPresent || !step || !recipe) return
    const params = new URLSearchParams(location.search)
    params.delete('step')
    const query = params.toString()
    navigate(
      `${location.pathname}${query ? `?${query}` : ''}${location.hash}`,
      { replace: true, state: location.state }
    )
  }, [
    location.hash,
    location.pathname,
    location.search,
    location.state,
    navigate,
    recipe,
    step,
    isPresent,
  ])

  if (!validId)
    return (
      <RouteMessage title="recipes.recipeUnavailable" onClose={closeOverlay} />
    )
  if (isLoading) return <RouteMessage title="common.loading" />
  if (isError || !recipe)
    return (
      <RouteMessage
        title="recipes.recipeUnavailable"
        onClose={closeOverlay}
        retry={isError ? () => void refetch() : undefined}
      />
    )

  return (
    <RecipeDetailModal
      isExiting={!isPresent}
      recipe={recipe}
      allTags={allTags}
      onClose={() => closeOverlay()}
      onUpdated={onUpdated}
      onDeleted={(id) => {
        onDeleted(id)
        closeOverlay(true)
      }}
      onOpenRecipe={openRelatedRecipe}
      initialMode={initialMode}
      activeAllergens={activeAllergens}
      scrollToStep={step}
      cookModeOpen={location.hash === '#cook'}
      onOpenCookMode={openCookMode}
      onCloseCookMode={closeCookMode}
    />
  )
}

const RouteMessage = ({
  title,
  onClose,
  retry,
}: {
  title: string
  onClose?: () => void
  retry?: () => void
}) => {
  const { t } = useTranslation()

  return (
    <Modal
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose?.()
      }}
    >
      <ModalContainer size="sm">
        <ModalDialog
          aria-label={t(title)}
          aria-live="polite"
          className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-xl"
        >
          <h2 className="text-lg font-semibold">{t(title)}</h2>
          <div className="mt-5 flex justify-center gap-3">
            {retry && (
              <button
                className="rounded-lg bg-primary px-4 py-2 text-white"
                onClick={retry}
              >
                {t('common.tryAgain')}
              </button>
            )}
            {onClose && (
              <button className="rounded-lg border px-4 py-2" onClick={onClose}>
                {t('common.close')}
              </button>
            )}
          </div>
        </ModalDialog>
      </ModalContainer>
    </Modal>
  )
}

interface RoutedAppShellProps {
  recipes: RecipeOut[]
  recipesLoading: boolean
  allTags: Tag[]
  preferences: UserPreferences | null
  stats: import('@carrot/shared/types').RecipeStats | null
  onRecipeUpdated: (recipe: RecipeOut) => void
  onRecipeDeleted: (id: string) => void
  onStatsRefresh: () => void
  onPreferencesChange: (preferences: UserPreferences) => void
  importJobs: ImportJob[]
  onRetryImportJob: (id: string) => Promise<unknown>
  onDismissImportJob: (id: string) => Promise<unknown>
  onContinueImportManually: (url: string | null) => void
  onRecipeSaved: () => void
  seedImportJob: (job: ImportJob) => void
  onPublicRecipeAdded: (recipe: RecipeOut) => Promise<void>
}

const RoutedAppShell = ({
  recipes,
  recipesLoading,
  allTags,
  preferences,
  stats,
  onRecipeUpdated,
  onRecipeDeleted,
  onStatsRefresh,
  onPreferencesChange,
  importJobs,
  onRetryImportJob,
  onDismissImportJob,
  onContinueImportManually,
  onRecipeSaved,
  seedImportJob,
  onPublicRecipeAdded,
}: RoutedAppShellProps) => {
  const location = useLocation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { t } = useTranslation()
  const { activeHouseholdId } = useHousehold()
  const previousAllergenStatus = useRef<{
    householdId: string
    status: AllergenRecheckStatus
  } | null>(null)
  const { data: allergenRecheckStatus } = useQuery({
    queryKey: ['allergen-recheck-status', activeHouseholdId],
    queryFn: getAllergenRecheckStatus,
    enabled: Boolean(activeHouseholdId),
    refetchInterval: (query) =>
      query.state.data && !query.state.data.done ? 1000 : 15000,
  })

  useEffect(() => {
    if (!activeHouseholdId || !allergenRecheckStatus) return
    const previous = previousAllergenStatus.current
    const prior =
      previous?.householdId === activeHouseholdId ? previous.status : null
    if (prior && allergenRecheckStatus.completed > prior.completed) {
      void qc.invalidateQueries({ queryKey: ['recipes'] })
    }
    if (prior && !prior.done && allergenRecheckStatus.done) {
      void qc.invalidateQueries({ queryKey: ['recipes'] })
      if (allergenRecheckStatus.failed > 0) {
        toast.danger(
          t('settings.allergenRecheckFailed', {
            failed: allergenRecheckStatus.failed,
          })
        )
      } else {
        toast.success(t('settings.allergenRecheckComplete'))
      }
    }
    previousAllergenStatus.current = {
      householdId: activeHouseholdId,
      status: allergenRecheckStatus,
    }
  }, [activeHouseholdId, allergenRecheckStatus, qc, t])
  const { openAddRecipe, closeOverlay, openRecipe } = useRouteNavigation()
  const background = getRoutedBackground(location)
  const contentLocation =
    background ??
    (location.pathname.startsWith('/recipe/')
      ? { ...location, pathname: '/', search: '', hash: '', state: null }
      : location)
  const isAddRoute = location.pathname === '/recipe/new'
  const isRecipeRoute = location.pathname.startsWith('/recipe/') && !isAddRoute
  const importMode = parseImportMode(
    new URLSearchParams(location.search).get('mode')
  )
  const recipesPage = (
    <RecipesPage
      recipes={recipes}
      loading={recipesLoading}
      allTags={allTags}
      onRecipeUpdated={onRecipeUpdated}
      onRecipeDeleted={onRecipeDeleted}
      importJobs={importJobs}
      onRetryImportJob={onRetryImportJob}
      onDismissImportJob={onDismissImportJob}
      onContinueImportManually={onContinueImportManually}
      onAddRecipe={() => openAddRecipe()}
    />
  )

  useEffect(() => {
    if (!isAddRoute) return
    const mode = new URLSearchParams(location.search).get('mode')
    if (mode && mode !== importMode)
      navigate('/recipe/new', { replace: true, state: location.state })
  }, [importMode, isAddRoute, location.search, location.state, navigate])

  useEffect(() => {
    if (location.pathname !== '/') return

    const params = new URLSearchParams(location.search)
    const recipeId = params.get('recipe')
    if (!isRecipeId(recipeId)) return

    const step = parseStep(params.get('step'))
    params.delete('recipe')
    params.delete('step')
    const search = params.toString()
    const background = { ...location, search: search ? `?${search}` : '' }

    openRecipe(recipeId, { step: step ?? undefined, background })
  }, [location, openRecipe])

  return (
    <div className="min-h-screen bg-background md:bg-zinc-100">
      <div className="md:max-w-screen-2xl md:mx-auto md:flex md:min-h-screen">
        <Sidebar hideNextMeal={location.pathname.startsWith('/r/')} />
        <div className="flex-1 min-w-0 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0 md:bg-background md:my-2 md:mr-2 md:rounded-xl md:shadow-sm">
          <PageTransition location={contentLocation}>
            {(displayLocation) =>
              displayLocation.pathname.startsWith('/r/') ? (
                <>
                  <RecipesPage
                    recipes={recipes}
                    loading={recipesLoading}
                    allTags={allTags}
                    onRecipeUpdated={onRecipeUpdated}
                    onRecipeDeleted={onRecipeDeleted}
                    importJobs={importJobs}
                    onRetryImportJob={onRetryImportJob}
                    onDismissImportJob={onDismissImportJob}
                    onContinueImportManually={onContinueImportManually}
                    onAddRecipe={() => openAddRecipe()}
                  />
                </>
              ) : (
                <Routes location={displayLocation}>
                  <Route
                    path="/"
                    element={<HouseholdGate>{recipesPage}</HouseholdGate>}
                  />
                  <Route
                    path="/plan"
                    element={
                      <HouseholdGate>
                        <MealPlanPage
                          recipes={recipes}
                          preferences={preferences}
                        />
                      </HouseholdGate>
                    }
                  />
                  <Route
                    path="/shopping"
                    element={
                      <HouseholdGate>
                        <ShoppingListPage />
                      </HouseholdGate>
                    }
                  />
                  <Route
                    path="/settings"
                    element={
                      <SettingsPage
                        stats={stats}
                        allergenRecheckStatus={allergenRecheckStatus ?? null}
                        onStatsRefresh={onStatsRefresh}
                        preferences={preferences}
                        onPreferencesChange={onPreferencesChange}
                      />
                    }
                  />
                  <Route
                    path="*"
                    element={<HouseholdGate>{recipesPage}</HouseholdGate>}
                  />
                </Routes>
              )
            }
          </PageTransition>
        </div>
      </div>
      <BottomNav onAddRecipe={() => openAddRecipe()} />
      <AddRecipeFab onAddRecipe={() => openAddRecipe()} />
      <AnimatePresence>
        {location.pathname.startsWith('/r/') && (
          <PublicRecipeOverlay
            key="public-recipe-overlay"
            location={location}
            onAdded={onPublicRecipeAdded}
          />
        )}
        {isRecipeRoute && (
          <RecipeRouteOverlay
            key="recipe-overlay"
            location={location}
            allTags={allTags}
            recipes={recipes}
            onUpdated={onRecipeUpdated}
            onDeleted={onRecipeDeleted}
          />
        )}
      </AnimatePresence>
      <AddRecipeModal
        isOpen={isAddRoute}
        initialImportMode={importMode}
        onImportModeChange={(mode) =>
          navigate(addRecipePath(mode), {
            replace: true,
            state: location.state,
          })
        }
        onClose={() => closeOverlay()}
        onSaved={onRecipeSaved}
        onImportEnqueued={(job) => {
          seedImportJob(job)
          navigate('/')
        }}
      />
      <ResumeTimersModal />
      <ExpiredTimersModal />
    </div>
  )
}

const AppShell = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const handlePublicRecipeAdded = useCallback(
    async (recipe: RecipeOut) => {
      await qc.invalidateQueries({ queryKey: ['recipes'] })
      navigate(`/recipe/${recipe.id}`)
    },
    [navigate, qc]
  )

  const { households } = useHouseholds()
  const hasHousehold = households.length > 0
  const { recipes, isLoading: recipesLoading } = useRecipes(hasHousehold)
  const { tags: allTags } = useTags(hasHousehold)
  const { data: statsData } = useRecipeStats(hasHousehold)
  const stats = statsData ?? null
  const { preferences } = usePreferences()
  const {
    jobs: importJobs,
    seed: seedImportJob,
    retry: retryImportJob,
    dismiss: dismissImportJob,
  } = useImportJobs(
    hasHousehold && user
      ? `${user.id}:${user.active_household_id ?? 'personal'}`
      : null
  )

  useEffect(() => {
    if (preferences?.language) void i18n.changeLanguage(preferences.language)
  }, [preferences?.language])

  // Ref starts at the current id so this effect skips the initial mount and only fires on actual switches
  const prevHouseholdId = useRef(user?.active_household_id)
  useEffect(() => {
    if (prevHouseholdId.current === user?.active_household_id) return
    prevHouseholdId.current = user?.active_household_id
    void qc.invalidateQueries({ queryKey: ['recipes'] })
    void qc.invalidateQueries({ queryKey: ['tags'] })
    void qc.invalidateQueries({ queryKey: ['recipes', 'stats'] })
    void qc.invalidateQueries({ queryKey: ['preferences'] })
    void qc.invalidateQueries({ queryKey: ['mealPlan'] })
  }, [user?.active_household_id, qc])

  const handleRecipeUpdated = useCallback(
    (updated: RecipeOut) => {
      qc.setQueryData<RecipeOut[]>(['recipes'], (old = []) =>
        old.map((r) => (r.id === updated.id ? updated : r))
      )
      void qc.invalidateQueries({ queryKey: ['allergen-recheck-status'] })
    },
    [qc]
  )

  const handleRecipeDeleted = useCallback(
    (id: string) => {
      qc.setQueryData<RecipeOut[]>(['recipes'], (old = []) =>
        old.filter((r) => r.id !== id)
      )
      void qc.invalidateQueries({ queryKey: ['recipes', 'stats'] })
    },
    [qc]
  )

  const handleRecipeSaved = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['recipes'] })
    void qc.invalidateQueries({ queryKey: ['recipes', 'stats'] })
    void qc.invalidateQueries({ queryKey: ['allergen-recheck-status'] })
  }, [qc])

  const handleStatsRefresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['recipes', 'stats'] })
  }, [qc])

  const handlePreferencesChange = useCallback(
    (prefs: UserPreferences) => {
      qc.setQueryData(['preferences'], prefs)
    },
    [qc]
  )

  const openTextImport = useCallback(
    (sourceUrl: string | null) => {
      navigate('/recipe/new?mode=text')
      if (sourceUrl) window.open(sourceUrl, '_blank', 'noopener,noreferrer')
    },
    [navigate]
  )

  return (
    <NotificationHistoryProvider>
      <TimerProvider>
        <HouseholdProvider>
          <RouteNavigationProvider>
            <RoutedAppShell
              recipes={recipes}
              recipesLoading={recipesLoading}
              allTags={allTags}
              preferences={preferences}
              stats={stats}
              onRecipeUpdated={handleRecipeUpdated}
              onRecipeDeleted={handleRecipeDeleted}
              onStatsRefresh={handleStatsRefresh}
              onPreferencesChange={handlePreferencesChange}
              importJobs={importJobs}
              onRetryImportJob={retryImportJob.mutateAsync}
              onDismissImportJob={dismissImportJob.mutateAsync}
              onContinueImportManually={openTextImport}
              onRecipeSaved={handleRecipeSaved}
              seedImportJob={seedImportJob}
              onPublicRecipeAdded={handlePublicRecipeAdded}
            />
          </RouteNavigationProvider>
        </HouseholdProvider>
      </TimerProvider>
    </NotificationHistoryProvider>
  )
}

export default AppShell
