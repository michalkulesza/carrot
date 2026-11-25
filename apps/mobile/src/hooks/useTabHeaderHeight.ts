import { useCallback, useState } from 'react'
import type { LayoutChangeEvent } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Scroll views keep contentInsetAdjustmentBehavior="automatic" (iOS insets the status bar and tab bar), so they only pad by the header part below the status bar.
export const useTabHeaderHeight = () => {
  const { top } = useSafeAreaInsets()
  const [headerHeight, setHeaderHeight] = useState(0)

  const handleHeaderLayout = useCallback((e: LayoutChangeEvent) => {
    const { height } = e.nativeEvent.layout

    setHeaderHeight((current) => (Math.abs(current - height) < 0.5 ? current : height))
  }, [])

  const scrollPaddingTop = Math.max(0, headerHeight - top)

  return { headerHeight, scrollPaddingTop, handleHeaderLayout }
}
