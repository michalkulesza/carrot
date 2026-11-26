import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Modal, Text, View } from 'react-native'
import { useIsFocused, useLocalSearchParams, useNavigation } from 'expo-router'
import { GestureDetector } from 'react-native-gesture-handler'
import Animated, { useAnimatedRef } from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import type { MealPlanEntry } from '@carrot/shared/types'
import { usePreferences } from '@carrot/shared/hooks/usePreferences'
import { toISODate, toYYYYMM, parseISODateLocal } from '@carrot/shared/utils/dateUtils'
import { palette } from '../../theme'
import { useScreenLoading } from '../../hooks/useScreenLoading'
import DayCard from './DayCard'
import DishDrawer from './DishDrawer'
import DragPreview from './DragPreview'
import LoadWeekButton from './LoadWeekButton'
import { styles } from './styles'
import { useDishActions } from './useDishActions'
import { useDragToMove } from './useDragToMove'
import { useExportMealPlanPdf } from './useExportMealPlanPdf'
import { useMealPlanHeader } from './useMealPlanHeader'
import { useMealPlanInsets } from './useMealPlanInsets'
import { useMealPlanWeeks } from './useMealPlanWeeks'
import { useScrollToToday } from './useScrollToToday'
import { useScrollToTodayOnTabPress } from './useScrollToTodayOnTabPress'

const DEFAULT_WEEK_START_DAY = 1
const NO_ENTRIES: MealPlanEntry[] = []
const SCROLL_BOTTOM_GAP = 16

const MealPlanScreen = () => {
  const { t, i18n } = useTranslation()
  const navigation = useNavigation()
  const isFocused = useIsFocused()
  const insets = useMealPlanInsets()
  const { focusToday, planToday } = useLocalSearchParams<{ focusToday?: string; planToday?: string }>()
  const { preferences } = usePreferences()

  const locale = i18n.language
  const weekStartDay = preferences?.week_start_day ?? DEFAULT_WEEK_START_DAY

  const todayIso = useMemo(() => toISODate(new Date()), [isFocused])

  const { weeks, currentWeekStartIso, entriesByDate, isLoading, loadPreviousWeek, loadNextWeek, resetWeeks } =
    useMealPlanWeeks({ todayIso, weekStartDay, locale })
  const { showSpinner } = useScreenLoading(isLoading)

  const allDays = useMemo(() => weeks.flatMap((week) => week.days), [weeks])

  const { exporting, handleExportPdf } = useExportMealPlanPdf(toYYYYMM(parseISODateLocal(currentWeekStartIso)))
  useMealPlanHeader({ navigation, exporting, onExportPdf: handleExportPdf })

  const [dishDrawerDate, setDishDrawerDate] = useState<string | null>(null)
  const dishDrawerEntries = (dishDrawerDate ? entriesByDate.get(dishDrawerDate) : undefined) ?? NO_ENTRIES
  const closeDishDrawer = useCallback(() => setDishDrawerDate(null), [])
  const { handleDishPress, handleMove } = useDishActions({ weekStartDay, locale })

  const scrollRef = useAnimatedRef<Animated.ScrollView>()
  const drag = useDragToMove({
    scrollRef,
    coveredTop: insets.top,
    coveredBottom: insets.bottom,
    onDrop: handleMove,
  })
  const { handleDaysLayout: handleDragDaysLayout, pruneDayLayouts } = drag

  const draggingEntry = useMemo(() => {
    if (!drag.dragging) return null

    return allDays.flatMap((day) => day.entries).find((entry) => entry.id === drag.dragging?.entryId) ?? null
  }, [allDays, drag.dragging])

  const highlightedIso = drag.hoverIso && drag.hoverIso !== drag.dragging?.fromIso ? drag.hoverIso : null

  const { handleDaysLayout, handleDayLayout, handleScrollLayout, handleContentSizeChange, scrollToToday, releasePin } =
    useScrollToToday({
      scrollRef,
      ready: !isLoading,
      todayIso,
      coveredTop: insets.top,
      coveredBottom: insets.bottom,
      onDaysLayout: handleDragDaysLayout,
      onDayLayout: drag.registerDayLayout,
      onContentSizeChange: drag.handleContentSizeChange,
    })
  useScrollToTodayOnTabPress(scrollToToday)

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
    scrollToToday()
  }, [focusToday, resetWeeks, scrollToToday])

  const handledPlanTodayRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!planToday || !isFocused || handledPlanTodayRef.current === planToday) return

    handledPlanTodayRef.current = planToday
    scrollToToday()
    setDishDrawerDate(todayIso)
  }, [planToday, isFocused, todayIso, scrollToToday])

  const loadingOverlayStyle = useMemo(() => [styles.loadingOverlay, { top: insets.top + 12 }], [insets.top])
  const scrollContentStyle = useMemo(
    () => ({ paddingTop: insets.top, paddingBottom: insets.bottom + SCROLL_BOTTOM_GAP }),
    [insets.top, insets.bottom],
  )

  return (
    <View ref={drag.containerRef} style={styles.container} collapsable={false} onLayout={drag.handleContainerLayout}>
      <GestureDetector gesture={drag.scrollGesture}>
        <Animated.ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={scrollContentStyle}
          contentInsetAdjustmentBehavior="never"
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={drag.scrollHandler}
          onLayout={handleScrollLayout}
          onScrollBeginDrag={releasePin}
          onContentSizeChange={handleContentSizeChange}
        >
          <View style={styles.days} onLayout={handleDaysLayout}>
            <LoadWeekButton label={t('mealPlan.showPreviousWeek')} direction="up" onPress={handleLoadPreviousWeek} />
            {weeks.map((week) => (
              <Fragment key={week.startIso}>
                <Text style={styles.weekHeader} accessibilityRole="header">
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
                    onDayLayout={handleDayLayout}
                  />
                ))}
              </Fragment>
            ))}
            <LoadWeekButton label={t('mealPlan.showNextWeek')} direction="down" onPress={handleLoadNextWeek} />
          </View>
        </Animated.ScrollView>
      </GestureDetector>
      <DragPreview entry={draggingEntry} animatedStyle={drag.previewStyle} />

      {showSpinner && (
        <View style={loadingOverlayStyle} pointerEvents="none">
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
