import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  LayoutChangeEvent,
  ListRenderItemInfo,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import GlassViewSafe from '../components/GlassViewSafe'
import { Feather } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useNavigation } from 'expo-router'
import { useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Sharing from 'expo-sharing'
import { File, Paths } from 'expo-file-system'
import { useRecipes } from '@platekeeper/shared/hooks/useRecipes'
import { useApiClient } from '@platekeeper/shared/api/context'
import type { MealPlanEntry, RecipeOut } from '@platekeeper/shared/types'
import { toYYYYMM, toISODate, formatWeekdayShort, formatMonthYear } from '@platekeeper/shared/utils/dateUtils'
import { getToken } from '../api/client'
import BellMenu from '../components/BellMenu'
import { colors } from '../theme/colors'

const DAYS_BEFORE = 60
const DAYS_AFTER = 180
const DAY_ROW_HEIGHT = 72
const MONTH_HEADER_HEIGHT = 36

type ListItem =
  | { type: 'month'; key: string; label: string }
  | { type: 'day'; key: string; date: Date; isoDate: string }

// ─── RecipePicker modal ─────────────────────────────────────────────────────

interface RecipePickerProps {
  visible: boolean
  date: string
  currentRecipeId: string | null
  recipes: RecipeOut[]
  onPick: (recipeId: string) => void
  onRemove: () => void
  onClose: () => void
}

const RecipePicker = ({
  visible,
  date,
  currentRecipeId,
  recipes,
  onPick,
  onRemove,
  onClose,
}: RecipePickerProps) => {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return recipes
    return recipes.filter((r) => r.title.toLowerCase().includes(q))
  }, [recipes, search])

  const handleClose = useCallback(() => {
    setSearch('')
    onClose()
  }, [onClose])

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<RecipeOut>) => (
      <Pressable
        style={({ pressed }) => [
          styles.pickerItem,
          item.id === currentRecipeId && styles.pickerItemActive,
          pressed && { opacity: 0.7 },
        ]}
        onPress={() => {
          setSearch('')
          onPick(item.id)
        }}
        accessibilityLabel={item.title}
        accessibilityRole="button"
      >
        <Text
          style={[styles.pickerItemText, item.id === currentRecipeId && styles.pickerItemTextActive]}
          numberOfLines={2}
        >
          {item.title}
        </Text>
      </Pressable>
    ),
    [currentRecipeId, onPick],
  )

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.pickerContainer}>
        <GlassViewSafe style={styles.pickerHeader} glassEffectStyle="regular">
          <Text style={styles.pickerTitle}>{t('mealPlan.chooseDish')}</Text>
          <Text style={styles.pickerDate}>{date}</Text>
          <Pressable
            onPress={handleClose}
            style={({ pressed }) => [styles.pickerClose, pressed && { opacity: 0.7 }]}
            accessibilityLabel={t('common.close')}
            accessibilityRole="button"
          >
            <Text style={styles.pickerCloseText}>{t('common.close')}</Text>
          </Pressable>
        </GlassViewSafe>

        <TextInput
          style={styles.pickerSearch}
          placeholder={t('mealPlan.searchRecipes')}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          clearButtonMode="while-editing"
          accessibilityLabel={t('mealPlan.searchRecipes')}
        />

        {currentRecipeId && (
          <Pressable
            style={({ pressed }) => [styles.removeButton, pressed && { opacity: 0.7 }]}
            onPress={() => {
              setSearch('')
              onRemove()
            }}
            accessibilityLabel={t('mealPlan.removeFromPlan')}
            accessibilityRole="button"
          >
            <Text style={styles.removeButtonText}>{t('mealPlan.removeFromPlan')}</Text>
          </Pressable>
        )}

        {filtered.length === 0 ? (
          <View style={styles.pickerEmpty}>
            <Text style={styles.pickerEmptyText}>
              {recipes.length === 0
                ? t('mealPlan.noRecipesYet')
                : t('mealPlan.noRecipesMatch')}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            style={styles.pickerList}
          />
        )}
      </View>
    </Modal>
  )
}

// ─── Day row ────────────────────────────────────────────────────────────────

interface DayRowProps {
  date: Date
  entry: MealPlanEntry | undefined
  isToday: boolean
  onPress: (date: Date) => void
}

const DayRow = memo(({ date, entry, isToday, onPress }: DayRowProps) => {
  const { t, i18n } = useTranslation()
  const weekday = formatWeekdayShort(date, i18n.language)
  const dayLabel = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' }).format(date)

  return (
    <Pressable
      style={({ pressed }) => [styles.dayRow, isToday && styles.dayRowToday, pressed && { opacity: 0.7 }]}
      onPress={() => onPress(date)}
      accessibilityLabel={`${dayLabel}${entry ? ': ' + entry.recipe.title : ''}`}
      accessibilityRole="button"
    >
      <View style={styles.dayRowLeft}>
        <Text style={[styles.dayRowWeekday, isToday && styles.dayRowTextToday]}>{weekday}</Text>
        <Text style={[styles.dayRowNum, isToday && styles.dayRowTextToday]}>{date.getDate()}</Text>
        <Text style={[styles.dayRowMonth, isToday && styles.dayRowTextToday]}>{dayLabel.replace(/^\d+\s*/, '')}</Text>
      </View>
      <View style={styles.dayRowDivider} />
      <View style={styles.dayRowContent}>
        {entry ? (
          <Text style={styles.dayRowRecipe} numberOfLines={2}>{entry.recipe.title}</Text>
        ) : (
          <Text style={styles.dayRowEmpty}>{t('mealPlan.addDish')}</Text>
        )}
      </View>
    </Pressable>
  )
}, (prev, next) =>
  prev.isToday === next.isToday &&
  prev.onPress === next.onPress &&
  prev.date === next.date &&
  prev.entry?.recipe.id === next.entry?.recipe.id
)

// ─── Main screen ─────────────────────────────────────────────────────────────

const MealPlanScreen = () => {
  const { t, i18n } = useTranslation()
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  const [pickerDate, setPickerDate] = useState<Date | null>(null)
  const [exporting, setExporting] = useState(false)
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

  const handleExportPdf = useCallback(async () => {
    setExporting(true)
    try {
      const baseUrl = (process.env.EXPO_PUBLIC_API_URL as string | undefined) ?? ''
      const token = getToken()
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
      const res = await fetch(`${baseUrl}/api/export/meal-plan.pdf?month=${currentMonth}`, {
        headers,
        credentials: 'omit',
      })
      if (!res.ok) throw new Error(t('shoppingList.exportError'))
      const bytes = new Uint8Array(await res.arrayBuffer())
      const file = new File(Paths.cache, `meal-plan-${currentMonth}.pdf`)
      file.write(bytes)
      const canShare = await Sharing.isAvailableAsync()
      if (!canShare) throw new Error(t('shoppingList.exportError'))
      setExporting(false)
      await new Promise<void>(resolve => setTimeout(resolve, 100))
      await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' })
    } catch {
      // silently fail — share sheet handles errors
      setExporting(false)
    }
  }, [currentMonth, t])

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t('nav.mealPlan'),
      headerTitleAlign: 'center',
      headerRight: () => (
        <View style={styles.headerRight}>
          <Pressable
            onPress={handleExportPdf}
            disabled={exporting}
            hitSlop={8}
            style={({ pressed }) => [styles.exportBtn, pressed && { opacity: 0.7 }]}
            accessibilityLabel={t('shoppingList.exportPdf')}
            accessibilityRole="button"
          >
            <Feather name="printer" size={22} color={colors.secondaryLabel} />
          </Pressable>
          <BellMenu />
        </View>
      ),
    })
  }, [navigation, handleExportPdf, exporting, t])

  const { items, offsets, todayIndex, months } = useMemo(() => {
    const items: ListItem[] = []
    const offsets: number[] = []
    const monthSet = new Set<string>()
    let offset = 0
    let todayIndex = 0
    let prevMonth = ''

    const d = new Date(today)
    d.setDate(d.getDate() - DAYS_BEFORE)

    for (let i = 0; i < DAYS_BEFORE + DAYS_AFTER + 1; i++) {
      const monthKey = toYYYYMM(d)
      monthSet.add(monthKey)

      if (monthKey !== prevMonth) {
        prevMonth = monthKey
        offsets.push(offset)
        items.push({
          type: 'month',
          key: `month-${monthKey}`,
          label: formatMonthYear(d, i18n.language),
        })
        offset += MONTH_HEADER_HEIGHT
      }

      const iso = toISODate(d)
      if (iso === todayIso) todayIndex = items.length

      offsets.push(offset)
      items.push({ type: 'day', key: iso, date: new Date(d), isoDate: iso })
      offset += DAY_ROW_HEIGHT

      d.setDate(d.getDate() + 1)
    }

    return { items, offsets, todayIndex, months: Array.from(monthSet) }
  }, [today, todayIso, i18n.language])

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

  const setEntry = useMutation({
    mutationFn: ({ date, recipeId }: { date: string; recipeId: string }) =>
      api.setMealPlanEntry(date, recipeId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mealPlan'] }),
  })

  const deleteEntry = useMutation({
    mutationFn: api.deleteMealPlanEntry,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mealPlan'] }),
  })

  const listRef = useRef<FlatList>(null)
  const layoutDone = useRef(false)

  const initialScrollOffset = useMemo(() => {
    const todayOffset = offsets[todayIndex] ?? 0
    const screenHeight = Dimensions.get('window').height
    return Math.max(0, todayOffset - screenHeight / 2 + DAY_ROW_HEIGHT / 2)
  }, [offsets, todayIndex])

  const handleListLayout = useCallback(
    (e: LayoutChangeEvent) => {
      if (layoutDone.current) return
      layoutDone.current = true
      const listHeight = e.nativeEvent.layout.height
      const todayOffset = offsets[todayIndex] ?? 0
      const target = Math.max(0, todayOffset - listHeight / 2 + DAY_ROW_HEIGHT / 2)
      listRef.current?.scrollToOffset({ offset: target, animated: false })
    },
    [offsets, todayIndex],
  )

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: items[index]?.type === 'month' ? MONTH_HEADER_HEIGHT : DAY_ROW_HEIGHT,
      offset: offsets[index] ?? 0,
      index,
    }),
    [items, offsets],
  )

  const handleDayPress = useCallback((date: Date) => {
    setPickerDate(date)
  }, [])

  const handlePickRecipe = useCallback(
    (recipeId: string) => {
      if (!pickerDate) return
      setEntry.mutate({ date: toISODate(pickerDate), recipeId })
      setPickerDate(null)
    },
    [pickerDate, setEntry],
  )

  const handleRemoveEntry = useCallback(() => {
    if (!pickerDate) return
    deleteEntry.mutate(toISODate(pickerDate))
    setPickerDate(null)
  }, [pickerDate, deleteEntry])

  const handleClosePicker = useCallback(() => {
    setPickerDate(null)
  }, [])

  const handleScrollToToday = useCallback(() => {
    listRef.current?.scrollToIndex({ index: todayIndex, viewPosition: 0.5, animated: true })
  }, [todayIndex])

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

  const pickerDateStr = pickerDate ? toISODate(pickerDate) : ''
  const pickerCurrentRecipeId = pickerDate
    ? (entriesByDate.get(pickerDateStr)?.recipe.id ?? null)
    : null

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        contentOffset={{ x: 0, y: initialScrollOffset }}
        onLayout={handleListLayout}
        style={styles.list}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 16 }]}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        windowSize={5}
        maxToRenderPerBatch={20}
        initialNumToRender={14}
      />
      <Pressable
        style={({ pressed }) => [
          styles.todayBtn,
          { bottom: insets.bottom + 16 },
          pressed && { opacity: 0.8 },
        ]}
        onPress={handleScrollToToday}
        accessibilityLabel={t('mealPlan.today')}
        accessibilityRole="button"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <GlassViewSafe style={StyleSheet.absoluteFill} glassEffectStyle="regular" tintColor={colors.blue} />
        <Text style={styles.todayBtnText}>{t('mealPlan.today')}</Text>
      </Pressable>

      {isLoading && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="small" color={colors.brand} />
        </View>
      )}

      <Modal visible={exporting} transparent animationType="none" statusBarTranslucent>
        <View style={styles.exportOverlay}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      </Modal>

      {pickerDate && (
        <RecipePicker
          visible
          date={pickerDateStr}
          currentRecipeId={pickerCurrentRecipeId}
          recipes={recipes}
          onPick={handlePickRecipe}
          onRemove={handleRemoveEntry}
          onClose={handleClosePicker}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingOverlay: { position: 'absolute', top: 12, alignSelf: 'center' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  exportBtn: { padding: 4 },
  exportOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' },
  list: { flex: 1 },
  listContent: {},
  monthRow: {
    height: MONTH_HEADER_HEIGHT,
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 6,
    backgroundColor: colors.background,
  },
  monthRowLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.tertiaryLabel,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  dayRow: {
    height: DAY_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
    paddingHorizontal: 16,
  },
  dayRowToday: {
    borderLeftWidth: 3,
    borderLeftColor: colors.brand,
    paddingLeft: 13,
  },
  dayRowLeft: {
    width: 52,
    alignItems: 'center',
  },
  dayRowWeekday: {
    fontSize: 11,
    color: colors.tertiaryLabel,
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  dayRowNum: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.label,
    lineHeight: 24,
  },
  dayRowMonth: {
    fontSize: 10,
    color: colors.tertiaryLabel,
  },
  dayRowTextToday: {
    color: colors.brand,
  },
  dayRowDivider: {
    width: 1,
    height: 36,
    backgroundColor: colors.opaqueSeparator,
    marginHorizontal: 14,
  },
  dayRowContent: { flex: 1 },
  dayRowRecipe: {
    fontSize: 16,
    color: colors.label,
    fontWeight: '500',
  },
  dayRowEmpty: {
    fontSize: 13,
    color: colors.opaqueSeparator,
  },
  // picker
  pickerContainer: { flex: 1, backgroundColor: colors.background },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
    gap: 8,
  },
  pickerTitle: { fontSize: 17, fontWeight: '700', color: colors.label, flex: 1 },
  pickerDate: { fontSize: 16, color: colors.secondaryLabel },
  pickerClose: { padding: 4 },
  pickerCloseText: { fontSize: 16, color: colors.blue, fontWeight: '500' },
  pickerSearch: {
    margin: 12,
    borderWidth: 1,
    borderColor: colors.opaqueSeparator,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: colors.background,
  },
  removeButton: {
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fca5a5',
    backgroundColor: '#fef2f2',
    alignItems: 'center',
  },
  removeButtonText: { color: colors.red, fontWeight: '500', fontSize: 16 },
  pickerList: { flex: 1 },
  pickerItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  pickerItemActive: { backgroundColor: colors.brandLight },
  pickerItemText: { fontSize: 16, color: colors.label },
  pickerItemTextActive: { color: colors.brand, fontWeight: '600' },
  pickerEmpty: { flex: 1, padding: 40, alignItems: 'center' },
  pickerEmptyText: { fontSize: 16, color: colors.secondaryLabel, textAlign: 'center' },
  todayBtn: {
    position: 'absolute',
    right: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    overflow: 'hidden',
  },
  todayBtnText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
})

export default MealPlanScreen
