import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { FONT_SCALE_STORAGE_KEY, getNextFontScale, parseFontScale } from './helpers'

const FONT_SCALE_QUERY_KEY = ['cook-font-scale']

const readFontScale = async () => parseFontScale(await AsyncStorage.getItem(FONT_SCALE_STORAGE_KEY))

const useCookFontScale = () => {
  const queryClient = useQueryClient()

  const { data: fontScale = 1 } = useQuery({
    queryKey: FONT_SCALE_QUERY_KEY,
    queryFn: readFontScale,
    staleTime: Infinity,
  })

  const cycle = useCallback(() => {
    const current = queryClient.getQueryData<number>(FONT_SCALE_QUERY_KEY) ?? 1
    const next = getNextFontScale(current)

    queryClient.setQueryData(FONT_SCALE_QUERY_KEY, next)
    void AsyncStorage.setItem(FONT_SCALE_STORAGE_KEY, String(next))
  }, [queryClient])

  return { fontScale, cycle }
}

export default useCookFontScale
