import { useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Haptics from 'expo-haptics'
import * as KeepAwake from 'expo-keep-awake'
import { useIsFocused } from 'expo-router'
import { useIsAppActive } from '../../hooks/useIsAppActive'
import { DEFAULT_FONT_SIZE_INDEX, FONT_SIZE_STORAGE_KEY, KEEP_AWAKE_RECIPE_TAG, parseFontSizeIndex } from './helpers'
import { useCookingMode } from '../../context/CookingModeContext'

const FONT_SIZE_QUERY_KEY = ['recipe-font-size-index']

const readFontSizeIndex = async () => parseFontSizeIndex(await AsyncStorage.getItem(FONT_SIZE_STORAGE_KEY))

export const useDisplayPrefs = () => {
  const { enabled: keepScreenOn, setEnabled: setKeepScreenOn } = useCookingMode()
  const isFocused = useIsFocused()
  const isAppActive = useIsAppActive()
  const queryClient = useQueryClient()

  const { data: fontSizeIndex = DEFAULT_FONT_SIZE_INDEX } = useQuery({
    queryKey: FONT_SIZE_QUERY_KEY,
    queryFn: readFontSizeIndex,
    staleTime: Infinity,
  })

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
    queryClient.setQueryData(FONT_SIZE_QUERY_KEY, index)
    void AsyncStorage.setItem(FONT_SIZE_STORAGE_KEY, String(index))
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid)
  }, [queryClient])

  return {
    keepScreenOn,
    fontSizeIndex,
    handleToggleKeepScreenOn,
    handleFontSizeChange,
  }
}
