import { useMemo } from 'react'
import { Platform } from 'react-native'
import { useHeaderHeight } from 'expo-router/react-navigation'
import { initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context'

// The tab is mounted off-screen at launch: useHeaderHeight is still an estimate there (97.7pt vs 113pt on iOS 26) and the
// screen's safe area only gains the tab bar once shown, so both edges come from the window's fixed insets instead.
const NAV_BAR_HEIGHT = Number.parseInt(String(Platform.Version), 10) >= 26 ? 54 : 44
const TAB_BAR_HEIGHT = 49

export const useTabScreenInsets = () => {
  const headerHeight = useHeaderHeight()
  const screenInsets = useSafeAreaInsets()
  const windowInsets = initialWindowMetrics?.insets ?? screenInsets

  const top = Math.max(headerHeight, windowInsets.top + NAV_BAR_HEIGHT)
  const bottom = windowInsets.bottom + TAB_BAR_HEIGHT

  return useMemo(() => ({ top, bottom }), [top, bottom])
}
