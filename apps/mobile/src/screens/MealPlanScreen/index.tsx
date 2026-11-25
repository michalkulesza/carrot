import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Modal, Text, View } from 'react-native'
import { useIsFocused, useLocalSearchParams } from 'expo-router'
import { GestureDetector } from 'react-native-gesture-handler'
import Animated, { useAnimatedRef } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import type { MealPlanEntry } from '@carrot/shared/types'
import { usePreferences } from '@carrot/shared/hooks/usePreferences'
import { toISODate, toYYYYMM, parseISODateLocal } from '@carrot/shared/utils/dateUtils'
import { palette } from '../../theme'
import TabHeader from '../../components/TabHeader'
import { IconButton } from '../../components/ui'
import { useTabHeaderHeight } from '../../hooks/useTabHeaderHeight'
import { useScreenLoading } from '../../hooks/useScreenLoading'
import DayCard from './DayCard'
import DishDrawer from './DishDrawer'
import DragPreview from './DragPreview'
import LoadWeekButton from './LoadWeekButton'
import ThisWeekCard from './ThisWeekCard'
import { styles } from './styles'
import { useDishActions } from './useDishActions'
import { useDragToMove } from './useDragToMove'
import { useExportMealPlanPdf } from './useExportMealPlanPdf'
import { useMealPlanWeeks } from './useMealPlanWeeks'
import { useScrollToCurrentWeek } from './useScrollToCurrentWeek'

const DEFAULT_WEEK_START_DAY = 1
const NO_ENTRIES: MealPlanEntry[] = []
const TAB_BAR_HEIGHT = 49

const MealPlanScreen = () => {
  const { t, i18n } = useTranslation()
  const isFocused = useIsFocused()
  const { top: topSafeArea, bottom: bottomSafeArea } = useSafeAreaInsets()
  const { headerHeight, scrollPaddingTop, handleHeaderLayout } = useTabHeaderHeight()
  const { focusToday, planToday } = useLocalSearchParams<{ focusToday?: string; planToday?: string }>()
  const { preferences } = usePreferences()

  const locale = i18n.language
  const weekStartDay = preferences?.week_start_day ?? DEFAULT_WEEK_START_DAY

  const todayIso = useMemo(() => toISODate(new Date()), [isFocused])

  const { weeks, currentWeekStartIso, entriesByDate, isLoading, loadPreviousWeek, loadNextWeek, resetWeeks } =
    useMealPlanWeeks({ todayIso, weekStartDay, locale })

  const currentWeekDays = useMemo(() => weeks.find((week) => week.isCurrent)?.days ?? [], [weeks])
  const allDays = useMemo(() => weeks.flatMap((week) => week.days), [weeks])
  const plannedCount = useMemo(() => currentWeekDays.filter((day) => day.entries.length > 0).length, [currentWeekDays])
  const nextFreeDay = useMemo(
    () => currentWeekDays.find((day) => !day.isPast && day.entries.length === 0) ?? null,
    [currentWeekDays],
  )

  const { exporting, handleExportPdf } = useExportMealPlanPdf(toYYYYMM(parseISODateLocal(currentWeekStartIso)))
  const { showSpinner } = useScreenLoading(isLoading)

  const [dishDrawerDate, setDishDrawerDate] = useState<string | null>(null)
  const dishDrawerEntries = (dishDrawerDate ? entriesByDate.get(dishDrawerDate) : undefined) ?? NO_ENTRIES
  const closeDishDrawer = useCallback(() => setDishDrawerDate(null), [])
  const { handleDishPress, handleMove } = useDishActions({ weekStartDay, locale })

  const scrollRef = useAnimatedRef<Animated.ScrollView>()
  const drag = useDragToMove({
    scrollRef,
    contentInsetTop: topSafeArea,
    contentInsetBottom: bottomSafeArea + TAB_BAR_HEIGHT,
    topInset: headerHeight,
    onDrop: handleMove,
  })
  const { handleDaysLayout: handleDragDaysLayout, pruneDayLayouts } = drag

  const draggingEntry = useMemo(() => {
    if (!drag.dragging) return null

    return allDays.flatMap((day) => day.entries).find((entry) => entry.id === drag.dragging?.entryId) ?? null
  }, [allDays, drag.dragging])

  const highlightedIso = drag.hoverIso && drag.hoverIso !== drag.dragging?.fromIso ? drag.hoverIso : null

  const { handleDaysLayout, handleCurrentWeekLayout, scrollToCurrentWeek, releasePin } = useScrollToCurrentWeek({
    scrollRef,
    ready: !isLoading,
    minOffset: -topSafeArea,
    topOffset: headerHeight,
    onDaysLayout: handleDragDaysLayout,
  })

  useEffect(() => {
    pruneDayLayouts(allDays.map((day) => day.iso))
  }, [allDays, pruneDayLayouts])

  const handleLoadPreviousWeek = useCallback(() => {
    releasePin()
    loadPreviousWeek()
  }, [releasePin, loadPreviousWeek])

  const handleLoadNextWeek = useCallback(() => {
    releasePin()
    loadNextWeek()
  }, [releasePin, loadNextWeek])

  useEffect(() => {
    if (!focusToday) return

    resetWeeks()
    scrollToCurrentWeek()
  }, [focusToday, resetWeeks, scrollToCurrentWeek])

  const handledPlanTodayRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!planToday || !isFocused || handledPlanTodayRef.current === planToday) return

    handledPlanTodayRef.current = planToday
    scrollToCurrentWeek()
    setDishDrawerDate(todayIso)
  }, [planToday, isFocused, todayIso, scrollToCurrentWeek])

  return (
    <View ref={drag.containerRef} style={styles.container} collapsable={false} onLayout={drag.handleContainerLayout}>
      <GestureDetector gesture={drag.scrollGesture}>
        <Animated.ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingTop: scrollPaddingTop }]}
          scrollIndicatorInsets={{ top: scrollPaddingTop }}
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={drag.scrollHandler}
          onScrollBeginDrag={releasePin}
          onContentSizeChange={drag.handleContentSizeChange}
        >
          <View style={styles.days} onLayout={handleDaysLayout}>
            <LoadWeekButton label={t('mealPlan.showPreviousWeek')} direction="up" onPress={handleLoadPreviousWeek} />
            {weeks.map((week) => (
              <Fragment key={week.startIso}>
                <Text
                  style={styles.weekHeader}
                  accessibilityRole="header"
                  onLayout={week.isCurrent ? handleCurrentWeekLayout : undefined}
                >
                  {week.label}
                </Text>
                {week.days.map((day) => (
                  <DayCard
                    key={day.iso}
                    day={day}
                    isDropTarget={day.iso === highlightedIso}
                    draggingEntryId={drag.dragging?.entryId ?? null}
                    createGesture={drag.createGesture}
                    onAdd={setDishDrawerDate}
                    onDishPress={handleDishPress}
                    onDayLayout={drag.registerDayLayout}
                  />
                ))}
              </Fragment>
            ))}
            <LoadWeekButton label={t('mealPlan.showNextWeek')} direction="down" onPress={handleLoadNextWeek} />
          </View>
        </Animated.ScrollView>
      </GestureDetector>
      <TabHeader
        title={t('nav.mealPlan')}
        actions={
          <IconButton
            variant="glass"
            icon="printer"
            accessibilityLabel={t('shoppingList.exportPdf')}
            onPress={handleExportPdf}
            disabled={exporting}
          />
        }
        onLayout={handleHeaderLayout}
      >
        <ThisWeekCard
          days={currentWeekDays}
          plannedCount={plannedCount}
          nextFreeDay={nextFreeDay}
          onPlan={setDishDrawerDate}
          style={styles.weekCardInHeader}
        />
      </TabHeader>
      <DragPreview entry={draggingEntry} animatedStyle={drag.previewStyle} />

      {showSpinner && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="small" color={palette.action} />
        </View>
      )}

      <Modal visible={exporting} transparent animationType="none" statusBarTranslucent>
        <View style={styles.exportOverlay}>
          <ActivityIndicator size="large" color={palette.action} />
        </View>
      </Modal>

      <DishDrawer dateIso={dishDrawerDate} existingEntries={dishDrawerEntries} onClose={closeDishDrawer} />
    </View>
  )
}

export default MealPlanScreen
