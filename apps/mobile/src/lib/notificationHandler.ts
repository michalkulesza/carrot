import * as Notifications from 'expo-notifications'
import { isExpoGo } from '../context/TimerContext/helpers'
import { dismissPresentedByCollapseId, getRetractCollapseId } from './presentedNotifications'

const visibleBehavior = {
  shouldShowAlert: true,
  shouldPlaySound: true,
  shouldSetBadge: false,
  shouldShowBanner: true,
  shouldShowList: true,
}

const silentBehavior = {
  shouldShowAlert: false,
  shouldPlaySound: false,
  shouldSetBadge: false,
  shouldShowBanner: false,
  shouldShowList: false,
}

if (!isExpoGo) {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const retractCollapseId = getRetractCollapseId(
        notification.request.content.data as Record<string, unknown> | undefined,
      )
      if (!retractCollapseId) return visibleBehavior

      void dismissPresentedByCollapseId(retractCollapseId)
      return silentBehavior
    },
  })
}
