import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  LayoutChangeEvent,
  ListRenderItemInfo,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { useNavigation } from '@react-navigation/native'
import { useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import * as Sharing from 'expo-sharing'
import { File, Paths } from 'expo-file-system'
import { useRecipes } from '@platekeeper/shared/hooks/useRecipes'
import { useApiClient } from '@platekeeper/shared/api/context'
import type { MealPlanEntry, RecipeOut } from '@platekeeper/shared/types'
import { toYYYYMM, toISODate, formatWeekdayShort, formatMonthYear } from '@platekeeper/shared/utils/dateUtils'
import { getToken } from '../api/client'
import BellModal from '../components/BellModal'

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
      <TouchableOpacity
        style={[styles.pickerItem, item.id === currentRecipeId && styles.pickerItemActive]}
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
      </TouchableOpacity>
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
        <View style={styles.pickerHeader}>
          <Text style={styles.pickerTitle}>{t('mealPlan.chooseDish')}</Text>
          <Text style={styles.pickerDate}>{date}</Text>
          <TouchableOpacity
            onPress={handleClose}
            style={styles.pickerClose}
            accessibilityLabel={t('common.close')}
            accessibilityRole="button"
          >
            <Text style={styles.pickerCloseText}>{t('common.close')}</Text>
          </TouchableOpacity>
        </View>

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
          <TouchableOpacity
            style={styles.removeButton}
            onPress={() => {
              setSearch('')
              onRemove()
            }}
            accessibilityLabel={t('mealPlan.removeFromPlan')}
            accessibilityRole="button"
          >
            <Text style={styles.removeButtonText}>{t('mealPlan.removeFromPlan')}</Text>
          </TouchableOpacity>
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

const DayRow = ({ date, entry, isToday, onPress }: DayRowProps) => {
  const { t, i18n } = useTranslation()
  const weekday = formatWeekdayShort(date, i18n.language)
  const dayLabel = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' }).format(date)

  return (
    <TouchableOpacity
      style={[styles.dayRow, isToday && styles.dayRowToday]}
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
    </TouchableOpacity>
  )
}

// ─── Main screen ─────────────────────────────────────────────────────────────

const MealPlanScreen = () => {
  const { t, i18n } = useTranslation()
  const navigation = useNavigation()
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
      await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' })
    } catch {
      // silently fail — share sheet handles errors
    } finally {
      setExporting(false)
    }
  }, [currentMonth, t])

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={handleExportPdf}
            disabled={exporting}
            style={styles.exportBtn}
            accessibilityLabel={t('shoppingList.exportPdf')}
            accessibilityRole="button"
          >
            <Text style={[styles.exportBtnText, exporting && styles.exportBtnTextDisabled]}>
              {exporting ? t('shoppingList.exporting') : t('shoppingList.exportPdf')}
            </Text>
          </TouchableOpacity>
          <BellModal />
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
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
      {isLoading && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="small" color="#7c3aed" />
        </View>
      )}

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
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingOverlay: { position: 'absolute', top: 12, alignSelf: 'center' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  exportBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  exportBtnText: { fontSize: 13, color: '#7c3aed', fontWeight: '600' },
  exportBtnTextDisabled: { color: '#c4b5fd' },
  list: { flex: 1 },
  listContent: { paddingBottom: 40 },
  monthRow: {
    height: MONTH_HEADER_HEIGHT,
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 6,
    backgroundColor: '#f9fafb',
  },
  monthRowLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  dayRow: {
    height: DAY_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    paddingHorizontal: 16,
  },
  dayRowToday: {
    borderLeftWidth: 3,
    borderLeftColor: '#7c3aed',
    paddingLeft: 13,
  },
  dayRowLeft: {
    width: 52,
    alignItems: 'center',
  },
  dayRowWeekday: {
    fontSize: 11,
    color: '#9ca3af',
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  dayRowNum: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
    lineHeight: 24,
  },
  dayRowMonth: {
    fontSize: 10,
    color: '#9ca3af',
  },
  dayRowTextToday: {
    color: '#7c3aed',
  },
  dayRowDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 14,
  },
  dayRowContent: { flex: 1 },
  dayRowRecipe: {
    fontSize: 14,
    color: '#111',
    fontWeight: '500',
  },
  dayRowEmpty: {
    fontSize: 13,
    color: '#d1d5db',
  },
  // picker
  pickerContainer: { flex: 1, backgroundColor: '#fff' },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    gap: 8,
  },
  pickerTitle: { fontSize: 17, fontWeight: '700', color: '#111', flex: 1 },
  pickerDate: { fontSize: 14, color: '#6b7280' },
  pickerClose: { padding: 4 },
  pickerCloseText: { fontSize: 15, color: '#2563eb', fontWeight: '500' },
  pickerSearch: {
    margin: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: '#f9fafb',
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
  removeButtonText: { color: '#dc2626', fontWeight: '500', fontSize: 14 },
  pickerList: { flex: 1 },
  pickerItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  pickerItemActive: { backgroundColor: '#ede9fe' },
  pickerItemText: { fontSize: 15, color: '#111' },
  pickerItemTextActive: { color: '#7c3aed', fontWeight: '600' },
  pickerEmpty: { flex: 1, padding: 40, alignItems: 'center' },
  pickerEmptyText: { fontSize: 14, color: '#6b7280', textAlign: 'center' },
})

export default MealPlanScreen
