import { useEffect } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'
import { useApiClient } from '@carrot/shared/api/context'
import { getToken } from '../api/client'
import { isExpoGo } from '../context/TimerContext/helpers'
import { createUuid } from '../utils/uuid'

const PUSH_INSTALLATION_ID_KEY = 'push-installation-id'

const getInstallationId = async () => {
  const stored = await AsyncStorage.getItem(PUSH_INSTALLATION_ID_KEY)
  if (stored) return stored

  const created = createUuid()
  await AsyncStorage.setItem(PUSH_INSTALLATION_ID_KEY, created)
  return created
}

export const usePushRegistration = (userId: string | undefined) => {
  const api = useApiClient()

  useEffect(() => {
    if (!userId || isExpoGo) return

    let active = true
    let installationId: string | null = null

    const register = async () => {
      try {
        const permissions = await Notifications.requestPermissionsAsync()
        if (!permissions.granted || !active) return

        installationId = await getInstallationId()
        const token = await Notifications.getDevicePushTokenAsync()
        if (active) await api.registerDevice(installationId, token.data)
      } catch {}
    }
    void register()

    return () => {
      active = false
      if (installationId && getToken()) void api.unregisterDevice(installationId).catch(() => {})
    }
  }, [api, userId])
}
