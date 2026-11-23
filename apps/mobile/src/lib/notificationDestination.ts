import { getTimerDestination, withNavigationNonce, type TimerSource } from '../context/TimerContext/helpers'

type NotificationData = Record<string, unknown>

const getTimerNotificationDestination = (data: NotificationData): string | null => {
  if (
    typeof data.recipeId !== 'string' ||
    typeof data.componentIndex !== 'number' ||
    typeof data.stepIndex !== 'number'
  ) return null

  const destination = getTimerDestination({
    recipeId: data.recipeId,
    componentIndex: data.componentIndex,
    stepIndex: data.stepIndex,
    source: data.source as TimerSource | undefined,
  })

  return withNavigationNonce(destination)
}

export const getNotificationDestination = (data: NotificationData | undefined): string | null => {
  switch (data?.type) {
    case 'recipe_imported':
      return typeof data.recipe_id === 'string' ? `/recipe/${data.recipe_id}` : null
    case 'recipe_failed':
      return '/(tabs)/home'
    case 'household_invitation':
    case 'member_left':
      return '/(tabs)/settings'
    case 'timer_done':
      return getTimerNotificationDestination(data)
    default:
      return null
  }
}
