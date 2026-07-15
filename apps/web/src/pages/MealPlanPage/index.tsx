import { useCallback, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'react-feather'
import { useTranslation } from 'react-i18next'
import { Button, Spinner } from '@heroui/react'
import { getLocalTimeZone, today } from '@internationalized/date'
import type {
  MealPlanEntry,
  RecipeOut,
  Tag,
  UserPreferences,
} from '@carrot/shared/types'
import {
  ymToYYYYMM,
  ymdToISODate,
  formatMonthYear,
} from '@carrot/shared/utils/dateUtils'
import { useMealPlan } from '@carrot/shared/hooks/useMealPlan'
import RecipeDetailModal from '../../components/RecipeDetailModal'
import PageHeader from '../../components/PageHeader'
import { useHousehold } from '../../context/HouseholdContext'
import { exportMealPlan, getActiveAllergens, printMealPlan } from './helpers'
import { useScrollToToday } from './useScrollToToday'
import DesktopCalendar from './DesktopCalendar'
import DayRow from './DayRow'
import RecipePickerModal from './RecipePickerModal'
import DayActionModal from './DayActionModal'

interface MealPlanPageProps {
  recipes: RecipeOut[]
  preferences: UserPreferences | null
  allTags: Tag[]
  onTagCreated: (tag: Tag) => void
  onRecipeUpdated?: (r: RecipeOut) => void
  onRecipeDeleted?: (id: string) => void
}

const MealPlanPage = ({
  recipes,
  preferences,
  allTags,
  onTagCreated,
  onRecipeUpdated,
  onRecipeDeleted,
}: MealPlanPageProps) => {
  const { activeHousehold } = useHousehold()
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const activeAllergens = getActiveAllergens(
    activeHousehold?.allergens,
    preferences?.personal_allergens
  )

  const todayDate = today(getLocalTimeZone())
  const [viewYear, setViewYear] = useState(todayDate.year)
  const [viewMonth, setViewMonth] = useState(todayDate.month)
  const monthKey = ymToYYYYMM(viewYear, viewMonth)

  const {
    entries,
    isLoading: loading,
    setEntry,
    deleteEntry,
  } = useMealPlan(monthKey)
  const busy = setEntry.isPending || deleteEntry.isPending

  const [pickerOpen, setPickerOpen] = useState(false)
  const [targetDate, setTargetDate] = useState<string | null>(null)
  const [actionEntry, setActionEntry] = useState<MealPlanEntry | null>(null)
  const [viewRecipe, setViewRecipe] = useState<RecipeOut | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const { stickyRef, setDayRef } = useScrollToToday(
    viewYear,
    viewMonth,
    todayDate
  )

  const daysInMonth = useMemo(
    () => new Date(viewYear, viewMonth, 0).getDate(),
    [viewYear, viewMonth]
  )

  const entriesByDate = useMemo(
    () => new Map(entries.map((e) => [e.date, e])),
    [entries]
  )

  const filteredRecipes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()

    return q
      ? recipes.filter((r) => r.title.toLowerCase().includes(q))
      : recipes
  }, [recipes, searchQuery])

  const goToPrevMonth = useCallback(() => {
    if (viewMonth === 1) {
      setViewYear((y) => y - 1)
      setViewMonth(12)
    } else {
      setViewMonth((m) => m - 1)
    }
  }, [viewMonth])

  const goToNextMonth = useCallback(() => {
    if (viewMonth === 12) {
      setViewYear((y) => y + 1)
      setViewMonth(1)
    } else {
      setViewMonth((m) => m + 1)
    }
  }, [viewMonth])

  const goToToday = useCallback(() => {
    setViewYear(todayDate.year)
    setViewMonth(todayDate.month)
  }, [todayDate.year, todayDate.month])

  const openPicker = useCallback((dateStr: string) => {
    setTargetDate(dateStr)
    setSearchQuery('')
    setPickerOpen(true)
    setActionEntry(null)
  }, [])

  const handleCellClick = useCallback(
    (dateStr: string, entry?: MealPlanEntry) => {
      if (entry) setActionEntry(entry)
      else openPicker(dateStr)
    },
    [openPicker]
  )

  const closePicker = useCallback(() => {
    setPickerOpen(false)
    setTargetDate(null)
  }, [])

  const handleAssign = useCallback(
    (recipe: RecipeOut) => {
      if (!targetDate) return

      setEntry.mutate(
        { date: targetDate, recipeId: recipe.id },
        { onSuccess: closePicker }
      )
    },
    [targetDate, setEntry, closePicker]
  )

  const handleAddText = useCallback(
    (text: string) => {
      if (!targetDate) return

      setEntry.mutate({ date: targetDate, text }, { onSuccess: closePicker })
    },
    [targetDate, setEntry, closePicker]
  )

  const handleRemove = useCallback(() => {
    if (!actionEntry) return

    deleteEntry.mutate(actionEntry.date, {
      onSuccess: () => setActionEntry(null),
    })
  }, [actionEntry, deleteEntry])

  const closeActionEntry = useCallback(() => setActionEntry(null), [])
  const clearViewRecipe = useCallback(() => setViewRecipe(null), [])

  const handleViewRecipe = useCallback(() => {
    if (actionEntry?.recipe) setViewRecipe(actionEntry.recipe)
  }, [actionEntry])

  const handleChangeRecipe = useCallback(() => {
    if (actionEntry) openPicker(actionEntry.date)
  }, [actionEntry, openPicker])

  const handlePrint = useCallback(
    () => printMealPlan(entries, viewYear, viewMonth),
    [entries, viewYear, viewMonth]
  )
  const handleExport = useCallback(
    () => void exportMealPlan(viewYear, viewMonth),
    [viewYear, viewMonth]
  )

  const exportDisabled = loading || entries.length === 0
  const isActionModalOpen = !!actionEntry && !viewRecipe

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title={t('mealPlan.title')}
        action={
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              isDisabled={exportDisabled}
              onPress={handlePrint}
            >
              {t('mealPlan.print')}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              isDisabled={exportDisabled}
              onPress={handleExport}
            >
              {t('mealPlan.exportXlsx')}
            </Button>
          </div>
        }
      />

      <div className="hidden md:block">
        <DesktopCalendar
          viewYear={viewYear}
          viewMonth={viewMonth}
          locale={locale}
          entriesByDate={entriesByDate}
          loading={loading}
          todayDate={todayDate}
          weekStart={preferences?.week_start_day ?? 1}
          onPrev={goToPrevMonth}
          onNext={goToNextMonth}
          onToday={goToToday}
          onCellClick={handleCellClick}
        />
      </div>

      <div className="md:hidden">
        <div
          ref={stickyRef}
          className="sticky top-14 z-20 bg-background/95 backdrop-blur-md border-b border-zinc-200"
        >
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="text-base font-semibold">
              {formatMonthYear(new Date(viewYear, viewMonth - 1, 1), locale)}
            </h2>
            <div className="flex items-center gap-1">
              <button
                onClick={goToToday}
                className="px-2.5 py-1 text-xs font-medium rounded-lg border border-zinc-200 active:bg-zinc-100 transition-colors mr-1"
              >
                {t('mealPlan.today')}
              </button>
              <button
                onClick={goToPrevMonth}
                className="p-1.5 rounded-lg active:bg-zinc-100 transition-colors"
                aria-label={t('mealPlan.prevMonth')}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={goToNextMonth}
                className="p-1.5 rounded-lg active:bg-zinc-100 transition-colors"
                aria-label={t('mealPlan.nextMonth')}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>

        <div>
          {loading ? (
            <div className="flex justify-center py-16">
              <Spinner size="lg" />
            </div>
          ) : (
            Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
              const dateStr = ymdToISODate(viewYear, viewMonth, day)
              const entry = entriesByDate.get(dateStr)
              const isToday =
                day === todayDate.day &&
                viewMonth === todayDate.month &&
                viewYear === todayDate.year

              return (
                <DayRow
                  key={dateStr}
                  day={day}
                  year={viewYear}
                  month={viewMonth}
                  locale={locale}
                  entry={entry}
                  isToday={isToday}
                  isSelected={isToday}
                  setRef={setDayRef(day)}
                  onAdd={() => openPicker(dateStr)}
                  onTap={() => entry && setActionEntry(entry)}
                />
              )
            })
          )}
        </div>
      </div>

      <RecipePickerModal
        isOpen={pickerOpen}
        onClose={closePicker}
        hasRecipes={recipes.length > 0}
        filteredRecipes={filteredRecipes}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        busy={busy}
        onAddText={handleAddText}
        onSelectRecipe={handleAssign}
      />

      <DayActionModal
        entry={actionEntry}
        isOpen={isActionModalOpen}
        onClose={closeActionEntry}
        busy={busy}
        onViewRecipe={handleViewRecipe}
        onChangeRecipe={handleChangeRecipe}
        onRemove={handleRemove}
      />

      <RecipeDetailModal
        recipe={viewRecipe}
        allTags={allTags}
        onTagCreated={onTagCreated}
        onClose={clearViewRecipe}
        onUpdated={onRecipeUpdated}
        onDeleted={onRecipeDeleted}
        activeAllergens={activeAllergens}
      />
    </div>
  )
}

export default MealPlanPage
