import { useMemo } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export const useInsetContentStyle = (paddingBottom: number, paddingTop = 0) => {
  const { bottom } = useSafeAreaInsets()

  return useMemo(() => ({ paddingTop, paddingBottom: paddingBottom + bottom }), [paddingTop, paddingBottom, bottom])
}
