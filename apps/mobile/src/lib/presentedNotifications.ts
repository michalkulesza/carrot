import * as Notifications from 'expo-notifications'
import type { ImportJob, InvitationOut } from '@carrot/shared/types'
import { isExpoGo } from '../context/TimerContext/helpers'

type NotificationData = Record<string, unknown>

const IMPORT_COLLAPSE_PREFIX = 'import:'
const INVITE_COLLAPSE_PREFIX = 'invite:'

export const dismissPresentedWhere = async (predicate: (data: NotificationData) => boolean) => {
  if (isExpoGo) return

  try {
    const presented = await Notifications.getPresentedNotificationsAsync()
    const matching = presented.filter((notification) =>
      predicate((notification.request.content.data ?? {}) as NotificationData),
    )
    await Promise.all(
      matching.map((notification) => Notifications.dismissNotificationAsync(notification.request.identifier)),
    )
  } catch {}
}

export const dismissPresentedByCollapseId = (collapseId: string) =>
  dismissPresentedWhere((data) => data.collapse_id === collapseId)

export const getRetractCollapseId = (data: NotificationData | undefined): string | null => {
  if (data?.type !== 'retract') return null

  return typeof data.collapse_id === 'string' ? data.collapse_id : null
}

export const reconcileImportNotifications = (jobs: ImportJob[]) => {
  const failedCollapseIds = new Set(
    jobs.filter((job) => job.status === 'failed').map((job) => `${IMPORT_COLLAPSE_PREFIX}${job.id}`),
  )

  return dismissPresentedWhere(
    (data) =>
      data.type === 'recipe_failed' &&
      typeof data.collapse_id === 'string' &&
      data.collapse_id.startsWith(IMPORT_COLLAPSE_PREFIX) &&
      !failedCollapseIds.has(data.collapse_id),
  )
}

export const reconcileInvitationNotifications = (invitations: InvitationOut[]) => {
  const pendingCollapseIds = new Set(invitations.map((invitation) => `${INVITE_COLLAPSE_PREFIX}${invitation.id}`))

  return dismissPresentedWhere(
    (data) =>
      typeof data.collapse_id === 'string' &&
      data.collapse_id.startsWith(INVITE_COLLAPSE_PREFIX) &&
      !pendingCollapseIds.has(data.collapse_id),
  )
}
