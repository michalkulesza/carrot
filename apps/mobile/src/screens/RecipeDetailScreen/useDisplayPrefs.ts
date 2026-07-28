import { useCallback, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Haptics from 'expo-haptics'
import * as KeepAwake from 'expo-keep-awake'
import { useIsFocused } from 'expo-router'
import { useIsAppActive } from '../../hooks/useIsAppActive'
import { FONT_SIZE_STORAGE_KEY, KEEP_AWAKE_RECIPE_TAG } from './helpers'
import { useCookingMode } from '../../context/CookingModeContext'

export const useDisplayPrefs = () => {
  const { enabled: keepScreenOn, setEnabled: setKeepScreenOn } = useCookingMode()
  const isFocused = useIsFocused()
  const isAppActive = useIsAppActive()
  const [fontSizeIndex, setFontSizeIndex] = useState(2)

  useEffect(() => {
    AsyncStorage.getItem(FONT_SIZE_STORAGE_KEY).then((val) => {
      if (val !== null) setFontSizeIndex(Number(val))
    })
  }, [])

  useEffect(() => {
    if (isAppActive && isFocused && keepScreenOn) {
      void KeepAwake.activateKeepAwakeAsync(KEEP_AWAKE_RECIPE_TAG)
    } else {
      KeepAwake.deactivateKeepAwake(KEEP_AWAKE_RECIPE_TAG)
    }

    return () => {
      KeepAwake.deactivateKeepAwake(KEEP_AWAKE_RECIPE_TAG)
    }
  }, [isAppActive, isFocused, keepScreenOn])

  const handleToggleKeepScreenOn = useCallback(
    (val: boolean) => {
      setKeepScreenOn(val)
    },
    [setKeepScreenOn],
  )

  const handleFontSizeChange = useCallback((index: number) => {
    setFontSizeIndex(index)
    void AsyncStorage.setItem(FONT_SIZE_STORAGE_KEY, String(index))
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid)
  }, [])

  return {
    keepScreenOn,
    fontSizeIndex,
    handleToggleKeepScreenOn,
    handleFontSizeChange,
  }
}
