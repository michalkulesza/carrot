import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  ListRenderItemInfo,
  Modal,
  Pressable,
  Text,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { useIsFocused, useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import { useHeaderHeight } from 'expo-router/react-navigation'
import { useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import * as Haptics from 'expo-haptics'
import { GestureDetector } from 'react-native-gesture-handler'
import ReanimatedAnimated from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-screens/experimental'
import { useRecipes } from '@carrot/shared/hooks/useRecipes'
import { useApiClient } from '@carrot/shared/api/context'
import { useMealPlanStream } from '@carrot/shared/hooks/useMealPlanStream'
import { useMoveMealPlanEntry } from '@carrot/shared/hooks/useMoveMealPlanEntry'
import type { MealPlanEntry } from '@carrot/shared/types'
import { toYYYYMM, toISODate } from '@carrot/shared/utils/dateUtils'
import { colors } from '../../theme/colors'
import RecipePicker from '../../components/RecipePicker'
import { useScreenLoading } from '../../hooks/useScreenLoading'
import { usePlanMealForDate } from '../../hooks/usePlanMealForDate'
import { buildListItems, DAY_ROW_HEIGHT, MONTH_HEADER_HEIGHT, type ListItem } from './helpers'
import { styles } from './styles'
import DayRow from './DayRow'
import DragPreviewCard from './DragPreviewCard'
import DropTargetHighlight from './DropTargetHighlight'
import { useExportMealPlanPdf } from './useExportMealPlanPdf'
import { useMealPlanHeader } from './useMealPlanHeader'
import { useCenterOnToday } from './useCenterOnToday'
import { useDragToMove } from './useDragToMove'

const MealPlanScreen = () => {
  const { t, i18n } = useTranslation()
  const navigation = useNavigation()
  const router = useRouter()
  const { focusToday, planToday } = useLocalSearchParams<{ focusToday?: string; planToday?: string }>()
  const api = useApiClient()
  const qc = useQueryClient()
  const { recipes } = useRecipes()

  useMealPlanStream()

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const todayIso = useMemo(() => toISODate(today), [today])
  const currentMonth = useMemo(() => toYYYYMM(today), [today])

  const { exporting, handleExportPdf } = useExportMealPlanPdf(currentMonth)
  useMealPlanHeader({ navigation, exporting, onExportPdf: handleExportPdf })

  const { items, offsets, todayIndex, months, contentHeight } = useMemo(
    () => buildListItems(today, todayIso, i18n.language),
    [today, todayIso, i18n.language],
  )

  const queries = useQueries({
    queries: months.map((month) => ({
      queryKey: ['mealPlan', month],
      queryFn: () => api.listMealPlan(month),
    })),
  })

  const entriesByDate = useMemo(() => {
    const map = new Map<string, MealPlanEntry>()
    for (const q of queries) {
      for (const entry of (q.data ?? [])) {
        map.set(entry.date, entry)
      }
    }
    return map
  }, [queries])

  const isLoading = queries.some((q) => q.isLoading)
  // Gate our own spinner on auth being ready so it doesn't stack with the root loadingOverlay.
  const { showSpinner } = useScreenLoading(isLoading)

  const deleteEntry = useMutation({
    mutationFn: api.deleteMealPlanEntry,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mealPlan'] }),
  })

  const moveEntry = useMoveMealPlanEntry()

  const headerHeight = useHeaderHeight()
  const isFocused = useIsFocused()
  const {
    listRef,
    listOpacity,
    handleListLayout,
    handleScrollBeginDrag,
    handleScrollToToday,
  } = useCenterOnToday({ todayIndex, isFocused })

  const handleDrop = useCallback(
    (from: string, to: string) => {
      moveEntry.mutate(
        { from, to },
        {
          onError: () => Alert.alert(t('mealPlan.moveFailed')),
        },
      )
    },
    [moveEntry, t],
  )

  const {
    draggingIsoDate,
    previewIsoDate,
    gesture,
    scrollHandler,
    handleContainerLayout,
    previewCardStyle,
    highlightStyle,
  } = useDragToMove({ listRef, items, offsets, contentHeight, entriesByDate, onDrop: handleDrop })

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: items[index]?.type === 'month' ? MONTH_HEADER_HEIGHT : DAY_ROW_HEIGHT,
      offset: offsets[index] ?? 0,
      index,
    }),
    [items, offsets],
  )

  const { pickerRef, openForDate, handlePick, handleAddText, handleRemove, handleClose } = usePlanMealForDate()

  const handleDayPress = useCallback((date: Date) => {
    const isoDate = toISODate(date)
    const existing = entriesByDate.get(isoDate)

    if (existing) {
      const changeMealAction = {
        text: existing.recipe ? t('mealPlan.changeRecipe') : t('mealPlan.changeMeal'),
        onPress: () => {
          openForDate(date)
        },
      }
      const removeMealAction = {
        text: t('mealPlan.removeFromPlan'),
        style: 'destructive' as const,
        onPress: () => deleteEntry.mutate(isoDate),
      }
      const actions = existing.recipe
        ? [
            {
              text: t('common.view'),
              onPress: () => router.push({ pathname: '/recipe/[id]', params: { id: existing.recipe!.id, title: existing.recipe!.title } }),
            },
            changeMealAction,
            removeMealAction,
          ]
        : [changeMealAction, removeMealAction]

      Alert.alert(existing.recipe?.title ?? existing.text ?? '', undefined, [
        ...actions,
        { text: t('common.cancel'), style: 'cancel' },
      ])
    } else {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      openForDate(date)
    }
  }, [entriesByDate, t, router, deleteEntry, openForDate])

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ListItem>) => {
      if (item.type === 'month') {
        return (
          <View style={styles.monthRow}>
            <Text style={styles.monthRowLabel}>{item.label}</Text>
          </View>
        )
      }
      return (
        <DayRow
          date={item.date}
          entry={entriesByDate.get(item.isoDate)}
          isToday={item.isoDate === todayIso}
          onPress={handleDayPress}
          isDraggingSource={item.isoDate === draggingIsoDate}
        />
      )
    },
    [entriesByDate, todayIso, handleDayPress, draggingIsoDate],
  )

  const getTodayBtnStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [styles.todayBtn, pressed && { opacity: 0.8 }],
    [],
  )

  const handleTodayPress = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    handleScrollToToday()
  }, [handleScrollToToday])

  useEffect(() => {
    if (focusToday) handleScrollToToday()
  }, [focusToday, handleScrollToToday])

  const handledPlanTodayRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!planToday || !isFocused || handledPlanTodayRef.current === planToday) return

    handledPlanTodayRef.current = planToday
    handleScrollToToday()
    openForDate(today)
  }, [planToday, isFocused, handleScrollToToday, openForDate, today])

  const draggingEntry = previewIsoDate ? entriesByDate.get(previewIsoDate) : undefined
  const visibleFrameStyle = useMemo(() => ({ paddingTop: headerHeight }), [headerHeight])

  const handleListContainerLayout = useCallback(
    (e: Parameters<typeof handleListLayout>[0]) => {
      handleListLayout(e)
      handleContainerLayout(e)
    },
    [handleListLayout, handleContainerLayout],
  )

  return (
    <View style={styles.container}>
      <SafeAreaView edges={{ bottom: true }} style={styles.safeArea}>
        <View style={[styles.visibleFrame, visibleFrameStyle]}>
          <Animated.View style={[styles.list, { opacity: listOpacity }]}>
            <GestureDetector gesture={gesture}>
              <View style={styles.list} onLayout={handleListContainerLayout}>
                <ReanimatedAnimated.FlatList
                  ref={listRef}
                  data={items}
                  keyExtractor={(item: ListItem) => item.key}
                  renderItem={renderItem}
                  getItemLayout={getItemLayout}
                  initialScrollIndex={todayIndex}
                  onScroll={scrollHandler}
                  onScrollBeginDrag={handleScrollBeginDrag}
                  style={styles.list}
                  contentContainerStyle={styles.listContent}
                  contentInsetAdjustmentBehavior="never"
                  showsVerticalScrollIndicator={false}
                  windowSize={5}
                  maxToRenderPerBatch={20}
                  initialNumToRender={14}
                />
                <DropTargetHighlight style={highlightStyle} />
                <DragPreviewCard entry={draggingEntry} style={previewCardStyle} />
              </View>
            </GestureDetector>
            <Pressable
              style={getTodayBtnStyle}
              onPress={handleTodayPress}
              accessibilityLabel={t('mealPlan.today')}
              accessibilityRole="button"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.todayBtnText}>{t('mealPlan.today')}</Text>
            </Pressable>
          </Animated.View>
        </View>
      </SafeAreaView>

      {showSpinner && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="small" color={colors.brand} />
        </View>
      )}

      <Modal visible={exporting} transparent animationType="none" statusBarTranslucent>
        <View style={styles.exportOverlay}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      </Modal>

      <RecipePicker
        ref={pickerRef}
        currentRecipeId={null}
        recipes={recipes}
        onAddText={handleAddText}
        onPick={handlePick}
        onRemove={handleRemove}
        onClose={handleClose}
      />
    </View>
  )
}

export default MealPlanScreen
