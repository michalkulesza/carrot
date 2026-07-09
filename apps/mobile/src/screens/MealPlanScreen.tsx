import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  LayoutChangeEvent,
  ListRenderItemInfo,
  Modal,
  PlatformColor,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import { BottomSheetModal, BottomSheetFlatList, BottomSheetTextInput, BottomSheetBackdrop, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet'
import GlassViewSafe from '../components/GlassViewSafe'
import { Feather } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useNavigation, useRouter } from 'expo-router'
import { useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Sharing from 'expo-sharing'
import { File, Paths } from 'expo-file-system'
import { useRecipes } from '@carrot/shared/hooks/useRecipes'
import { useApiClient } from '@carrot/shared/api/context'
import type { MealPlanEntry, RecipeOut } from '@carrot/shared/types'
import { toYYYYMM, toISODate, formatWeekdayShort, formatMonthYear } from '@carrot/shared/utils/dateUtils'
import { getToken } from '../api/client'
import BellMenu from '../components/BellMenu'
import BugReportButton from '../components/BugReportButton'
import HeaderTitle from '../components/HeaderTitle'
import { colors } from '../theme/colors'
import { proxyThumbnailUrl } from '../api/thumbnailUrl'
import { useScreenLoading } from '../hooks/useScreenLoading'

const DAYS_BEFORE = 60
const DAYS_AFTER = 180
const DAY_ROW_HEIGHT = 72
const MONTH_HEADER_HEIGHT = 36

type ListItem =
  | { type: 'month'; key: string; label: string }
  | { type: 'day'; key: string; date: Date; isoDate: string }

// ─── RecipePicker bottom sheet ──────────────────────────────────────────────

interface RecipePickerProps {
  currentRecipeId: string | null
  recipes: RecipeOut[]
  onPick: (recipeId: string) => void
  onRemove: () => void
  onClose: () => void
}

export interface RecipePickerHandle {
  present: () => void
  dismiss: () => void
}

const SNAP_POINTS = ['60%']

const RecipePicker = forwardRef<RecipePickerHandle, RecipePickerProps>(({
  currentRecipeId,
  recipes,
  onPick,
  onRemove,
  onClose,
}, ref) => {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const sheetRef = useRef<BottomSheetModal>(null)

  useImperativeHandle(ref, () => ({
    present: () => sheetRef.current?.present(),
    dismiss: () => sheetRef.current?.dismiss(),
  }))

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
    ),
    [],
  )

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
    ({ item }: ListRenderItemInfo<RecipeOut>) => {
      const thumbUri = proxyThumbnailUrl(item.thumbnail_url)
      return (
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
          {thumbUri ? (
            <Image source={{ uri: thumbUri }} style={styles.pickerItemThumb} resizeMode="cover" />
          ) : (
            <View style={styles.pickerItemThumbPlaceholder} />
          )}
          <Text
            style={[styles.pickerItemText, item.id === currentRecipeId && styles.pickerItemTextActive]}
            numberOfLines={2}
          >
            {item.title}
          </Text>
        </Pressable>
      )
    },
    [currentRecipeId, onPick],
  )

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={SNAP_POINTS}
      enableDynamicSizing={false}
      enablePanDownToClose
      onDismiss={handleClose}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.sheetBackground}
      handleIndicatorStyle={styles.sheetHandle}
    >
      <BottomSheetTextInput
        style={styles.pickerSearch}
        placeholder={t('mealPlan.searchRecipes')}
        placeholderTextColor={PlatformColor('placeholderText') as unknown as string}
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
        <BottomSheetFlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          style={styles.pickerList}
        />
      )}
    </BottomSheetModal>
  )
})

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
  const thumbUri = entry ? proxyThumbnailUrl(entry.recipe.thumbnail_url) : null

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
      {entry && (
        thumbUri ? (
          <Image source={{ uri: thumbUri }} style={styles.dayRowThumb} resizeMode="cover" />
        ) : (
          <View style={styles.dayRowThumbPlaceholder} />
        )
      )}
    </Pressable>
  )
}, (prev, next) =>
  prev.isToday === next.isToday &&
  prev.onPress === next.onPress &&
  prev.date === next.date &&
  prev.entry?.recipe.id === next.entry?.recipe.id &&
  prev.entry?.recipe.thumbnail_url === next.entry?.recipe.thumbnail_url
)

// ─── Main screen ─────────────────────────────────────────────────────────────

const MealPlanScreen = () => {
  const { t, i18n } = useTranslation()
  const navigation = useNavigation()
  const router = useRouter()
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
    const startedAt = Date.now()
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
      const elapsed = Date.now() - startedAt
      if (elapsed < 1000) await new Promise<void>(resolve => setTimeout(resolve, 1000 - elapsed))
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
      headerTitle: () => <HeaderTitle title={t('nav.mealPlan')} />,
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
          <BugReportButton />
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

  const listRef = useRef<FlatList>(null)
  const { height: windowHeight } = useWindowDimensions()

  // Rough starting position only, to avoid painting from the very top of the
  // list before the real centering runs — this is deliberately imprecise.
  // With contentInsetAdjustmentBehavior="automatic", the static contentOffset
  // prop is applied in a different coordinate space than the automatic
  // content-inset adjustment (confirmed: an offset computed with the exact
  // same formula/height as the working Today button still lands in a
  // different spot when set via this prop vs via scrollToIndex). So the real
  // position always has to come from an imperative scrollToIndex call — same
  // method the Today button already uses correctly — never from this prop.
  const initialScrollOffset = useMemo(() => {
    const todayOffset = offsets[todayIndex] ?? 0
    return Math.max(0, todayOffset - windowHeight / 2 + DAY_ROW_HEIGHT / 2)
  }, [offsets, todayIndex, windowHeight])

  const [isCentered, setIsCentered] = useState(false)
  const hasUserScrolled = useRef(false)
  const listOpacity = useRef(new Animated.Value(0)).current

  const recenterOnToday = useCallback((source: string) => {
    if (hasUserScrolled.current) return
    console.log(`[mealplan-center-v2] ${source} refExists=${!!listRef.current} todayIndex=${todayIndex}`)
    listRef.current?.scrollToIndex({ index: todayIndex, viewPosition: 0.5, animated: false })
    setIsCentered(true)
    setTimeout(() => {
      // @ts-expect-error - debug only
      console.log(`[mealplan-center-v2] ${source} post-scroll offset=${listRef.current?._listRef?._scrollMetrics?.offset}`)
    }, 30)
  }, [todayIndex])

  // Call it as soon as the ref exists (matches how quickly a real user could
  // tap Today), and again on every subsequent layout change in case that
  // first call landed before the FlatList was fully attached — cheap no-op
  // otherwise since it's idempotent.
  useEffect(() => {
    console.log('[mealplan-center-v2] BUILD MARKER 2026-07-09-b mounted')
    recenterOnToday('mount-effect')
  }, [recenterOnToday])

  const handleListLayout = useCallback(
    (_e: LayoutChangeEvent) => {
      recenterOnToday('onLayout')
    },
    [recenterOnToday],
  )

  const handleScrollBeginDrag = useCallback(() => {
    hasUserScrolled.current = true
  }, [])

  useEffect(() => {
    if (!isCentered) return
    Animated.timing(listOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start()
  }, [isCentered, listOpacity])

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

  const handleScrollToToday = useCallback(() => {
    console.log(`[mealplan-center-v2] today-button-tap todayIndex=${todayIndex}`)
    listRef.current?.scrollToIndex({ index: todayIndex, viewPosition: 0.5, animated: true })
    setTimeout(() => {
      // @ts-expect-error - debug only
      console.log(`[mealplan-center-v2] today-button-tap post-scroll offset=${listRef.current?._listRef?._scrollMetrics?.offset}`)
    }, 400)
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

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.list, { opacity: listOpacity }]}>
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          getItemLayout={getItemLayout}
          contentOffset={{ x: 0, y: initialScrollOffset }}
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
        <GlassViewSafe style={StyleSheet.absoluteFill} glassEffectStyle="clear" tintColor={colors.blue} />
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
    borderLeftColor: colors.blue,
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
    color: colors.blue,
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
  // day row thumbnail
  dayRowThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    marginLeft: 12,
  },
  dayRowThumbPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 8,
    marginLeft: 12,
    backgroundColor: PlatformColor('systemGray5') as unknown as string,
  },
  // picker bottom sheet
  sheetBackground: { backgroundColor: PlatformColor('secondarySystemBackground') as unknown as string },
  sheetHandle: { backgroundColor: PlatformColor('systemGray3') as unknown as string },
  pickerSearch: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PlatformColor('separator') as unknown as string,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: PlatformColor('label') as unknown as string,
    backgroundColor: PlatformColor('systemBackground') as unknown as string,
  },
  removeButton: {
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: PlatformColor('systemRed') as unknown as string,
    alignItems: 'center',
  },
  removeButtonText: { color: PlatformColor('systemRed') as unknown as string, fontWeight: '500', fontSize: 16 },
  pickerList: { flex: 1 },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PlatformColor('separator') as unknown as string,
  },
  pickerItemThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  pickerItemThumbPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: PlatformColor('systemGray5') as unknown as string,
  },
  pickerItemActive: { backgroundColor: colors.brandLight },
  pickerItemText: { flex: 1, fontSize: 16, color: PlatformColor('label') as unknown as string },
  pickerItemTextActive: { color: colors.brand, fontWeight: '600' },
  pickerEmpty: { flex: 1, padding: 40, alignItems: 'center' },
  pickerEmptyText: { fontSize: 16, color: PlatformColor('secondaryLabel') as unknown as string, textAlign: 'center' },
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
