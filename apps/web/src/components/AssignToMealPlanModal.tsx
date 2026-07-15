import { useCallback, useMemo, useState } from 'react'
import { Check, ChevronLeft, ChevronRight } from 'react-feather'
import { useTranslation } from 'react-i18next'
import { useMealPlan } from '@carrot/shared/hooks/useMealPlan'
import { usePreferences } from '@carrot/shared/hooks/usePreferences'
import {
  Modal,
  ModalBackdrop,
  ModalContainer,
  ModalDialog,
  ModalHeader,
  ModalBody,
} from '@heroui/react'
import {
  toYYYYMM,
  toISODate,
  formatMonthYear,
  weekdayShortByIndex,
} from '@carrot/shared/utils/dateUtils'

interface AssignToMealPlanModalProps {
  isOpen: boolean
  onClose: () => void
  recipeId: string
}

const startOfMonth = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), 1)

const buildMonthGrid = (
  monthDate: Date,
  weekStart: number
): (Date | null)[] => {
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

const dayCellBaseClassName =
  'w-9 h-9 rounded-full flex items-center justify-center text-sm transition-colors'

const getDayCellClassName = (
  isJustAssigned: boolean,
  isAlreadyAssigned: boolean,
  isToday: boolean
) => {
  if (isJustAssigned) return `${dayCellBaseClassName} bg-emerald-500 text-white`
  if (isAlreadyAssigned)
    return `${dayCellBaseClassName} border-2 border-emerald-500 text-emerald-600 font-semibold`
  if (isToday)
    return `${dayCellBaseClassName} border-2 border-primary text-primary font-semibold`

  return `${dayCellBaseClassName} text-zinc-700 hover:bg-zinc-100`
}

interface MonthNavButtonProps {
  direction: 'prev' | 'next'
  onClick: () => void
  ariaLabel: string
}

const MonthNavButton = ({
  direction,
  onClick,
  ariaLabel,
}: MonthNavButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={ariaLabel}
    className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 transition-colors"
  >
    {direction === 'prev' ? (
      <ChevronLeft size={18} />
    ) : (
      <ChevronRight size={18} />
    )}
  </button>
)

interface CalendarDayCellProps {
  date: Date
  isToday: boolean
  isJustAssigned: boolean
  isAlreadyAssigned: boolean
  disabled: boolean
  ariaLabel: string
  onSelect: (date: Date) => void
}

const CalendarDayCell = ({
  date,
  isToday,
  isJustAssigned,
  isAlreadyAssigned,
  disabled,
  ariaLabel,
  onSelect,
}: CalendarDayCellProps) => {
  const handlePress = useCallback(() => onSelect(date), [onSelect, date])

  return (
    <button
      type="button"
      onClick={handlePress}
      disabled={disabled}
      aria-label={ariaLabel}
      className="aspect-square flex items-center justify-center disabled:opacity-60"
    >
      <span
        className={getDayCellClassName(
          isJustAssigned,
          isAlreadyAssigned,
          isToday
        )}
      >
        {isJustAssigned ? <Check size={16} /> : date.getDate()}
      </span>
    </button>
  )
}

const AssignToMealPlanModal = ({
  isOpen,
  onClose,
  recipeId,
}: AssignToMealPlanModalProps) => {
  const { t, i18n } = useTranslation()
  const { preferences } = usePreferences()
  const weekStart = preferences?.week_start_day ?? 1

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)

    return d
  }, [])

  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(today))
  const [justAssigned, setJustAssigned] = useState<string | null>(null)

  const monthKey = toYYYYMM(visibleMonth)
  const { entries, setEntry } = useMealPlan(monthKey)

  const assignedDates = useMemo(
    () =>
      new Set(
        entries.filter((e) => e.recipe?.id === recipeId).map((e) => e.date)
      ),
    [entries, recipeId]
  )

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        setVisibleMonth(startOfMonth(today))
        setJustAssigned(null)
        onClose()
      }
    },
    [today, onClose]
  )

  const handleSelectDate = useCallback(
    (date: Date) => {
      const isoDate = toISODate(date)
      setJustAssigned(isoDate)

      setEntry.mutate(
        { date: isoDate, recipeId },
        {
          onSuccess: () => {
            setTimeout(() => handleOpenChange(false), 500)
          },
          onError: () => setJustAssigned(null),
        }
      )
    },
    [recipeId, setEntry, handleOpenChange]
  )

  const handlePrevMonth = useCallback(() => {
    setVisibleMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))
  }, [])

  const handleNextMonth = useCallback(() => {
    setVisibleMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))
  }, [])

  const cells = useMemo(
    () => buildMonthGrid(visibleMonth, weekStart),
    [visibleMonth, weekStart]
  )
  const rows = useMemo(() => chunk(cells, 7), [cells])
  const weekdayLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        weekdayShortByIndex((weekStart + i) % 7, i18n.language)
      ),
    [weekStart, i18n.language]
  )
  const todayIso = useMemo(() => toISODate(today), [today])

  return (
    <Modal isOpen={isOpen} onOpenChange={handleOpenChange}>
      <ModalBackdrop isDismissable>
        <ModalContainer size="sm" className="!rounded-xl overflow-hidden">
          <ModalDialog>
            <ModalHeader className="flex-col gap-0 pb-0">
              <div className="flex items-center justify-between w-full">
                <MonthNavButton
                  direction="prev"
                  onClick={handlePrevMonth}
                  ariaLabel={t('mealPlan.prevMonth')}
                />
                <span className="text-base font-semibold">
                  {formatMonthYear(visibleMonth, i18n.language)}
                </span>
                <MonthNavButton
                  direction="next"
                  onClick={handleNextMonth}
                  ariaLabel={t('mealPlan.nextMonth')}
                />
              </div>
            </ModalHeader>
            <ModalBody className="pt-3 pb-5">
              <div className="grid grid-cols-7 mb-1">
                {weekdayLabels.map((label, i) => (
                  <span
                    key={i}
                    className="text-center text-[11px] font-semibold uppercase tracking-wide text-zinc-400"
                  >
                    {label}
                  </span>
                ))}
              </div>
              <div className="flex flex-col gap-1">
                {rows.map((row, rowIndex) => (
                  <div key={rowIndex} className="grid grid-cols-7">
                    {row.map((date, i) => {
                      if (!date)
                        return <div key={i} className="aspect-square" />

                      const isoDate = toISODate(date)
                      const isToday = isoDate === todayIso
                      const isJustAssigned = justAssigned === isoDate
                      const isAlreadyAssigned =
                        !isJustAssigned && assignedDates.has(isoDate)
                      const ariaLabel = `${date.getDate()} ${formatMonthYear(date, i18n.language)}`

                      return (
                        <CalendarDayCell
                          key={i}
                          date={date}
                          isToday={isToday}
                          isJustAssigned={isJustAssigned}
                          isAlreadyAssigned={isAlreadyAssigned}
                          disabled={setEntry.isPending}
                          ariaLabel={ariaLabel}
                          onSelect={handleSelectDate}
                        />
                      )
                    })}
                  </div>
                ))}
              </div>
            </ModalBody>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  )
}

export default AssignToMealPlanModal
