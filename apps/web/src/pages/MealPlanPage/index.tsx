import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'react-feather'
import { useTranslation } from 'react-i18next'
import { Button, Spinner, toast } from '@heroui/react'
import { getLocalTimeZone, today } from '@internationalized/date'
import type {
  MealPlanEntry,
  RecipeOut,
  UserPreferences,
} from '@carrot/shared/types'
import {
  ymToYYYYMM,
  ymdToISODate,
  formatMonthYear,
} from '@carrot/shared/utils/dateUtils'
import { useMealPlan } from '@carrot/shared/hooks/useMealPlan'
import PageHeader from '../../components/PageHeader'
import { exportMealPlan, printMealPlan } from './helpers'
import { useScrollToToday } from './useScrollToToday'
import DesktopCalendar from './DesktopCalendar'
import DayRow from './DayRow'
import RecipePickerModal from './RecipePickerModal'
import DayActionModal from './DayActionModal'
import { useRouteNavigation } from '../../routing/RouteNavigationContext'
import { parseMonth, planPath } from '../../routing/routeState'

interface MealPlanPageProps {
  recipes: RecipeOut[]
  preferences: UserPreferences | null
}

const MealPlanPage = ({ recipes, preferences }: MealPlanPageProps) => {
  const { t, i18n } = useTranslation()
  const locale = i18n.language

  const location = useLocation()
  const navigate = useNavigate()
  const { openRecipe } = useRouteNavigation()
  const todayDate = today(getLocalTimeZone())
  const currentMonthKey = ymToYYYYMM(todayDate.year, todayDate.month)
  const parsedMonth = parseMonth(
    new URLSearchParams(location.search).get('month'),
    currentMonthKey
  )
  const monthKey = parsedMonth ?? currentMonthKey
  const [viewYear, viewMonth] = monthKey.split('-').map(Number)

  const {
    entries,
    isLoading: loading,
    setEntry,
    deleteEntry,
    moveEntry,
  } = useMealPlan(monthKey)
  const busy =
    setEntry.isPending || deleteEntry.isPending || moveEntry.isPending

  const [pickerOpen, setPickerOpen] = useState(false)
  const [targetDate, setTargetDate] = useState<string | null>(null)
  const [actionEntry, setActionEntry] = useState<MealPlanEntry | null>(null)
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

  const goToMonth = useCallback(
    (year: number, month: number) => {
      navigate(planPath(ymToYYYYMM(year, month), currentMonthKey))
    },
    [currentMonthKey, navigate]
  )
  const goToPrevMonth = useCallback(
    () =>
      goToMonth(
        viewMonth === 1 ? viewYear - 1 : viewYear,
        viewMonth === 1 ? 12 : viewMonth - 1
      ),
    [goToMonth, viewMonth, viewYear]
  )
  const goToNextMonth = useCallback(
    () =>
      goToMonth(
        viewMonth === 12 ? viewYear + 1 : viewYear,
        viewMonth === 12 ? 1 : viewMonth + 1
      ),
    [goToMonth, viewMonth, viewYear]
  )

  const goToToday = useCallback(() => {
    navigate('/plan')
  }, [navigate])

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
  const handleViewRecipe = useCallback(() => {
    if (actionEntry?.recipe) openRecipe(actionEntry.recipe.id)
  }, [actionEntry, openRecipe])

  const handleChangeRecipe = useCallback(() => {
    if (actionEntry) openPicker(actionEntry.date)
  }, [actionEntry, openPicker])

  const handleMoveEntry = useCallback(
    (from: string, to: string) => {
      moveEntry.mutate(
        { from, to },
        {
          onError: () =>
            toast.danger(t('mealPlan.moveFailed'), { timeout: 3000 }),
        }
      )
    },
    [moveEntry, t]
  )

  const handleMoveActionEntry = useCallback(
    (to: string) => {
      if (!actionEntry) return
      handleMoveEntry(actionEntry.date, to)
      setActionEntry(null)
    },
    [actionEntry, handleMoveEntry]
  )

  const handlePrint = useCallback(
    () => printMealPlan(entries, viewYear, viewMonth),
    [entries, viewYear, viewMonth]
  )
  const handleExport = useCallback(
    () => void exportMealPlan(viewYear, viewMonth),
    [viewYear, viewMonth]
  )

  const exportDisabled = loading || entries.length === 0
  const isActionModalOpen = !!actionEntry

  useEffect(() => {
    if (parsedMonth !== null) return
    navigate('/plan', { replace: true })
  }, [navigate, parsedMonth])

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
          onMoveEntry={handleMoveEntry}
        />
      </div>

      <div className="md:hidden">
        <div
          ref={stickyRef}
          className="sticky top-14 z-20 bg-background/95 backdrop-blur-md border-b border-zinc-200"
        >
          <div className="flex items-center justify-between px-4 md:px-6 py-3">
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
        onMoveEntry={handleMoveActionEntry}
      />
    </div>
  )
}

export default MealPlanPage
