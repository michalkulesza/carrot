import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { PlatformColor, Pressable, StyleSheet, Text, View } from 'react-native'
import { BottomSheetModal, BottomSheetBackdrop, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'
import { Feather } from '@expo/vector-icons'
import { useMealPlan } from '@platekeeper/shared/hooks/useMealPlan'
import { usePreferences } from '@platekeeper/shared/hooks/usePreferences'
import { toYYYYMM, toISODate, formatMonthYear, weekdayShortByIndex } from '@platekeeper/shared/utils/dateUtils'
import { colors } from '../theme/colors'

export interface AddToMealPlanSheetHandle {
  present: () => void
  dismiss: () => void
}

interface AddToMealPlanSheetProps {
  recipeId: string
}

const SNAP_POINTS = ['58%']

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1)

const buildMonthGrid = (monthDate: Date, weekStart: number): (Date | null)[] => {
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const firstWeekday = new Date(year, month, 1).getDay()
  const startPad = (firstWeekday - weekStart + 7) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (Date | null)[] = []
  for (let i = 0; i < startPad; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

const chunk = <T,>(arr: T[], size: number): T[][] => {
  const rows: T[][] = []
  for (let i = 0; i < arr.length; i += size) rows.push(arr.slice(i, i + size))
  return rows
}

const AddToMealPlanSheet = forwardRef<AddToMealPlanSheetHandle, AddToMealPlanSheetProps>(
  ({ recipeId }, ref) => {
    const { t, i18n } = useTranslation()
    const { preferences } = usePreferences()
    const weekStart = preferences?.week_start_day ?? 1
    const sheetRef = useRef<BottomSheetModal>(null)
    const today = useMemo(() => {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      return d
    }, [])
    const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(today))
    const [justAssigned, setJustAssigned] = useState<string | null>(null)

    const monthKey = toYYYYMM(visibleMonth)
    const { setEntry } = useMealPlan(monthKey)

    useImperativeHandle(ref, () => ({
      present: () => {
        setVisibleMonth(startOfMonth(today))
        setJustAssigned(null)
        sheetRef.current?.present()
      },
      dismiss: () => sheetRef.current?.dismiss(),
    }))

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
      ),
      [],
    )

    const handlePrevMonth = useCallback(() => {
      setVisibleMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
    }, [])

    const handleNextMonth = useCallback(() => {
      setVisibleMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
    }, [])

    const handleSelectDate = useCallback(
      (date: Date) => {
        const isoDate = toISODate(date)
        setJustAssigned(isoDate)
        setEntry.mutate(
          { date: isoDate, recipeId },
          {
            onSuccess: () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
              setTimeout(() => {
                sheetRef.current?.dismiss()
              }, 350)
            },
            onError: () => {
              setJustAssigned(null)
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
            },
          },
        )
      },
      [setEntry, recipeId],
    )

    const cells = useMemo(() => buildMonthGrid(visibleMonth, weekStart), [visibleMonth, weekStart])
    const rows = useMemo(() => chunk(cells, 7), [cells])
    const weekdayLabels = useMemo(
      () => Array.from({ length: 7 }, (_, i) => weekdayShortByIndex((weekStart + i) % 7, i18n.language)),
      [weekStart, i18n.language],
    )
    const todayIso = useMemo(() => toISODate(today), [today])

    return (
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={SNAP_POINTS}
        enableDynamicSizing={false}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.sheetHandle}
      >
        <View style={styles.container}>
          <Text style={styles.title}>{t('mealPlan.addToMealPlan')}</Text>

          <View style={styles.monthNavRow}>
            <Pressable
              onPress={handlePrevMonth}
              hitSlop={12}
              style={({ pressed }) => [styles.monthNavBtn, pressed && { opacity: 0.6 }]}
              accessibilityLabel={t('mealPlan.prevMonth')}
              accessibilityRole="button"
            >
              <Feather name="chevron-left" size={20} color={colors.secondaryLabel} />
            </Pressable>
            <Text style={styles.monthLabel}>{formatMonthYear(visibleMonth, i18n.language)}</Text>
            <Pressable
              onPress={handleNextMonth}
              hitSlop={12}
              style={({ pressed }) => [styles.monthNavBtn, pressed && { opacity: 0.6 }]}
              accessibilityLabel={t('mealPlan.nextMonth')}
              accessibilityRole="button"
            >
              <Feather name="chevron-right" size={20} color={colors.secondaryLabel} />
            </Pressable>
          </View>

          <View style={styles.weekdayRow}>
            {weekdayLabels.map((label, i) => (
              <Text key={i} style={styles.weekdayLabel}>{label}</Text>
            ))}
          </View>

          <View style={styles.grid}>
            {rows.map((row, rowIndex) => (
              <View key={rowIndex} style={styles.gridRow}>
                {row.map((date, i) => {
                  if (!date) return <View key={i} style={styles.dayCell} />
                  const isoDate = toISODate(date)
                  const isToday = isoDate === todayIso
                  const isAssigned = justAssigned === isoDate
                  return (
                    <Pressable
                      key={i}
                      onPress={() => handleSelectDate(date)}
                      disabled={setEntry.isPending}
                      style={({ pressed }) => [
                        styles.dayCell,
                        pressed && { opacity: 0.6 },
                      ]}
                      accessibilityLabel={`${date.getDate()} ${formatMonthYear(date, i18n.language)}`}
                      accessibilityRole="button"
                    >
                      <View
                        style={[
                          styles.dayCircle,
                          isToday && styles.dayCircleToday,
                          isAssigned && styles.dayCircleAssigned,
                        ]}
                      >
                        {isAssigned ? (
                          <Feather name="check" size={16} color="#ffffff" />
                        ) : (
                          <Text style={[styles.dayNum, isToday && styles.dayNumToday]}>
                            {date.getDate()}
                          </Text>
                        )}
                      </View>
                    </Pressable>
                  )
                })}
              </View>
            ))}
          </View>
        </View>
      </BottomSheetModal>
    )
  },
)

AddToMealPlanSheet.displayName = 'AddToMealPlanSheet'

export default AddToMealPlanSheet

const styles = StyleSheet.create({
  sheetBackground: { backgroundColor: PlatformColor('secondarySystemBackground') as unknown as string },
  sheetHandle: { backgroundColor: PlatformColor('systemGray3') as unknown as string },
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 4 },
  title: {
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 25,
    color: colors.label,
    textAlign: 'center',
    marginBottom: 16,
  },
  monthNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  monthNavBtn: { padding: 8 },
  monthLabel: { fontSize: 16, fontWeight: '600', color: colors.label },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    color: colors.tertiaryLabel,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  grid: {
    flexDirection: 'column',
  },
  gridRow: {
    flexDirection: 'row',
  },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleToday: {
    borderWidth: 1.5,
    borderColor: colors.blue,
  },
  dayCircleAssigned: {
    backgroundColor: colors.green,
  },
  dayNum: { fontSize: 16, color: colors.label },
  dayNumToday: { color: colors.blue, fontWeight: '600' },
})
