import { useCallback } from 'react'
import { ActionSheetIOS, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { useTranslation } from 'react-i18next'
import { getWeekDates } from '@carrot/shared/hooks/useMealPlanDays'
import { useMealPlanMutations } from '@carrot/shared/hooks/useMealPlanMutations'
import type { MealPlanEntry } from '@carrot/shared/types'
import { parseISODateLocal } from '@carrot/shared/utils/dateUtils'
import { formatWeekdayDayMonth, getEntryTitle, getWeekStartIso, shiftWeek } from './helpers'

export const useDishActions = ({ weekStartDay, locale }: { weekStartDay: number; locale: string }) => {
  const { t } = useTranslation()
  const router = useRouter()
  const { removeEntry, moveEntry } = useMealPlanMutations()

  const { mutate: removeMutate } = removeEntry
  const { mutate: moveMutate } = moveEntry

  const handleMove = useCallback(
    (entryId: string, toIso: string) => {
      moveMutate(
        { id: entryId, to: toIso },
        {
          onSuccess: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
          onError: () => Alert.alert(t('mealPlan.moveFailed')),
        },
      )
    },
    [moveMutate, t],
  )

  const handleRemove = useCallback(
    (entryId: string) => {
      removeMutate(entryId, { onError: () => Alert.alert(t('mealPlan.removeFailed')) })
    },
    [removeMutate, t],
  )

  const showDayPicker = useCallback(
    (entry: MealPlanEntry, pickerWeekStartIso: string, allowNextWeek: boolean) => {
      const dates = getWeekDates(pickerWeekStartIso).filter((iso) => iso !== entry.date)
      const dayLabels = dates.map((iso) => formatWeekdayDayMonth(iso, locale))
      const nextWeekIndex = allowNextWeek ? dayLabels.length : -1
      const options = [...dayLabels, ...(allowNextWeek ? [t('mealPlan.nextWeekEllipsis')] : []), t('common.cancel')]

      ActionSheetIOS.showActionSheetWithOptions(
        { title: getEntryTitle(entry), options, cancelButtonIndex: options.length - 1 },
        (index) => {
          if (index === options.length - 1) return
          if (index === nextWeekIndex) {
            showDayPicker(entry, shiftWeek(pickerWeekStartIso, 1), false)
            return
          }

          handleMove(entry.id, dates[index])
        },
      )
    },
    [handleMove, locale, t],
  )

  const handleDishPress = useCallback(
    (entry: MealPlanEntry) => {
      const { recipe } = entry
      const actions: { label: string; run: () => void; destructive?: boolean }[] = [
        ...(recipe
          ? [
              {
                label: t('mealPlan.viewRecipe'),
                run: () =>
                  router.push({ pathname: '/recipe/[id]', params: { id: recipe.id, title: recipe.title } }),
              },
            ]
          : []),
        { label: t('mealPlan.moveTo'), run: () => showDayPicker(entry, getWeekStartIso(parseISODateLocal(entry.date), weekStartDay), true) },
        { label: t('common.remove'), run: () => handleRemove(entry.id), destructive: true },
      ]
      const options = [...actions.map((action) => action.label), t('common.cancel')]
      const destructiveIndex = actions.findIndex((action) => action.destructive)

      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: getEntryTitle(entry),
          options,
          cancelButtonIndex: options.length - 1,
          destructiveButtonIndex: destructiveIndex,
        },
        (index) => actions[index]?.run(),
      )
    },
    [t, router, showDayPicker, weekStartDay, handleRemove],
  )

  return { handleDishPress, handleMove }
}
