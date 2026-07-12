import { useCallback, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Haptics from 'expo-haptics'
import * as KeepAwake from 'expo-keep-awake'
import {
  FONT_SIZE_STORAGE_KEY,
  KEEP_AWAKE_RECIPE_TAG,
  KEEP_AWAKE_STORAGE_KEY,
  SHOW_STEP_QTY_STORAGE_KEY,
} from './helpers'

export const useDisplayPrefs = () => {
  const [keepScreenOn, setKeepScreenOn] = useState(false)
  const [showStepQty, setShowStepQty] = useState(true)
  const [fontSizeIndex, setFontSizeIndex] = useState(2)

  useEffect(() => {
    AsyncStorage.getItem(KEEP_AWAKE_STORAGE_KEY).then((val) => {
      const enabled = val === '1'
      setKeepScreenOn(enabled)
      if (enabled) void KeepAwake.activateKeepAwakeAsync(KEEP_AWAKE_RECIPE_TAG)
    })
    AsyncStorage.getItem(SHOW_STEP_QTY_STORAGE_KEY).then((val) => {
      if (val !== null) setShowStepQty(val === '1')
    })
    AsyncStorage.getItem(FONT_SIZE_STORAGE_KEY).then((val) => {
      if (val !== null) setFontSizeIndex(Number(val))
    })
    return () => { KeepAwake.deactivateKeepAwake(KEEP_AWAKE_RECIPE_TAG) }
  }, [])

  const handleToggleKeepScreenOn = useCallback((val: boolean) => {
    setKeepScreenOn(val)
    void AsyncStorage.setItem(KEEP_AWAKE_STORAGE_KEY, val ? '1' : '0')
    if (val) void KeepAwake.activateKeepAwakeAsync(KEEP_AWAKE_RECIPE_TAG)
    else KeepAwake.deactivateKeepAwake(KEEP_AWAKE_RECIPE_TAG)
  }, [])

  const handleFontSizeChange = useCallback((index: number) => {
    setFontSizeIndex(index)
    void AsyncStorage.setItem(FONT_SIZE_STORAGE_KEY, String(index))
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }, [])

  return {
    keepScreenOn,
    showStepQty,
    fontSizeIndex,
    handleToggleKeepScreenOn,
    handleFontSizeChange,
  }
}
