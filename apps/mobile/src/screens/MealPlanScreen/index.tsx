import { useCallback, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  ListRenderItemInfo,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import GlassViewSafe from '../../components/GlassViewSafe'
import { useTranslation } from 'react-i18next'
import { useNavigation, useRouter } from 'expo-router'
import { useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { useRecipes } from '@carrot/shared/hooks/useRecipes'
import { useApiClient } from '@carrot/shared/api/context'
import type { MealPlanEntry } from '@carrot/shared/types'
import { toYYYYMM, toISODate } from '@carrot/shared/utils/dateUtils'
import { colors } from '../../theme/colors'
import { useScreenLoading } from '../../hooks/useScreenLoading'
import { buildListItems, DAY_ROW_HEIGHT, MONTH_HEADER_HEIGHT, type ListItem } from './helpers'
import { styles } from './styles'
import DayRow from './DayRow'
import RecipePicker, { type RecipePickerHandle } from './RecipePicker'
import { useExportMealPlanPdf } from './useExportMealPlanPdf'
import { useMealPlanHeader } from './useMealPlanHeader'
import { useCenterOnToday } from './useCenterOnToday'

const MealPlanScreen = () => {
  const { t, i18n } = useTranslation()
  const navigation = useNavigation()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [pickerDate, setPickerDate] = useState<Date | null>(null)
  const api = useApiClient()
  const qc = useQueryClient()
  const { recipes } = useRecipes()

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const todayIso = useMemo(() => toISODate(today), [today])
  const currentMonth = useMemo(() => toYYYYMM(today), [today])

  const { exporting, handleExportPdf } = useExportMealPlanPdf(currentMonth)
  useMealPlanHeader({ navigation, exporting, onExportPdf: handleExportPdf })

  const { items, offsets, todayIndex, months } = useMemo(
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

  const setEntry = useMutation({
    mutationFn: ({ date, recipeId }: { date: string; recipeId: string }) =>
      api.setMealPlanEntry(date, recipeId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mealPlan'] }),
  })

  const deleteEntry = useMutation({
    mutationFn: api.deleteMealPlanEntry,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mealPlan'] }),
  })

  const { height: windowHeight } = useWindowDimensions()
  const {
    listRef,
    listOpacity,
    targetScrollOffset,
    handleListLayout,
    handleScrollBeginDrag,
    handleScrollToToday,
  } = useCenterOnToday({ offsets, todayIndex, windowHeight, insets })

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: items[index]?.type === 'month' ? MONTH_HEADER_HEIGHT : DAY_ROW_HEIGHT,
      offset: offsets[index] ?? 0,
      index,
    }),
    [items, offsets],
  )

  const pickerRef = useRef<RecipePickerHandle>(null)

  const handleDayPress = useCallback((date: Date) => {
    const isoDate = toISODate(date)
    const existing = entriesByDate.get(isoDate)

    if (existing) {
      Alert.alert(existing.recipe.title, undefined, [
        {
          text: t('common.view'),
          onPress: () => router.push({ pathname: '/recipe/[id]', params: { id: existing.recipe.id, title: existing.recipe.title } }),
        },
        {
          text: t('mealPlan.changeRecipe'),
          onPress: () => {
            setPickerDate(date)
            pickerRef.current?.present()
          },
        },
        {
          text: t('mealPlan.removeFromPlan'),
          style: 'destructive',
          onPress: () => deleteEntry.mutate(isoDate),
        },
        { text: t('common.cancel'), style: 'cancel' },
      ])
    } else {
      setPickerDate(date)
      pickerRef.current?.present()
    }
  }, [entriesByDate, t, router, deleteEntry])

  const handlePickRecipe = useCallback(
    (recipeId: string) => {
      if (!pickerDate) return
      setEntry.mutate({ date: toISODate(pickerDate), recipeId })
      setPickerDate(null)
      pickerRef.current?.dismiss()
    },
    [pickerDate, setEntry],
  )

  const handleRemoveEntry = useCallback(() => {
    if (!pickerDate) return
    deleteEntry.mutate(toISODate(pickerDate))
    setPickerDate(null)
    pickerRef.current?.dismiss()
  }, [pickerDate, deleteEntry])

  const handleClosePicker = useCallback(() => {
    setPickerDate(null)
  }, [])

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
        />
      )
    },
    [entriesByDate, todayIso, handleDayPress],
  )

  const getTodayBtnStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [
      styles.todayBtn,
      { bottom: insets.bottom + 16 },
      pressed && { opacity: 0.8 },
    ],
    [insets.bottom],
  )

  const handleTodayPress = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    handleScrollToToday()
  }, [handleScrollToToday])

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.list, { opacity: listOpacity }]}>
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          getItemLayout={getItemLayout}
          contentOffset={{ x: 0, y: targetScrollOffset }}
          onLayout={handleListLayout}
          onScrollBeginDrag={handleScrollBeginDrag}
          style={styles.list}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 16 }]}
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          windowSize={5}
          maxToRenderPerBatch={20}
          initialNumToRender={14}
        />
      </Animated.View>
      <Pressable
        style={getTodayBtnStyle}
        onPress={handleTodayPress}
        accessibilityLabel={t('mealPlan.today')}
        accessibilityRole="button"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <GlassViewSafe style={StyleSheet.absoluteFill} glassEffectStyle="clear" tintColor={colors.orangeGlass} />
        <Text style={styles.todayBtnText}>{t('mealPlan.today')}</Text>
      </Pressable>

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
        onPick={handlePickRecipe}
        onRemove={handleRemoveEntry}
        onClose={handleClosePicker}
      />
    </View>
  )
}

export default MealPlanScreen
