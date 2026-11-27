import { useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as KeepAwake from 'expo-keep-awake'
import { useIsFocused } from 'expo-router'
import { useIsAppActive } from '../../hooks/useIsAppActive'
import { KEEP_AWAKE_SHOPPING_STORAGE_KEY } from '../SettingsScreen/helpers'

const KEEP_AWAKE_SHOPPING_TAG = 'shopping-list'

export const useKeepScreenOn = () => {
  const isFocused = useIsFocused()
  const isAppActive = useIsAppActive()
  const [keepScreenOn, setKeepScreenOn] = useState(false)

  useEffect(() => {
    if (!isFocused) {
      setKeepScreenOn(false)
      return
    }
    AsyncStorage.getItem(KEEP_AWAKE_SHOPPING_STORAGE_KEY)
      .then((value) => setKeepScreenOn(value === '1'))
      .catch(() => setKeepScreenOn(false))
  }, [isFocused])

  useEffect(() => {
    if (isAppActive && isFocused && keepScreenOn) {
      void KeepAwake.activateKeepAwakeAsync(KEEP_AWAKE_SHOPPING_TAG)
    } else {
      KeepAwake.deactivateKeepAwake(KEEP_AWAKE_SHOPPING_TAG)
    }
    return () => {
      KeepAwake.deactivateKeepAwake(KEEP_AWAKE_SHOPPING_TAG)
    }
  }, [isAppActive, isFocused, keepScreenOn])
}
