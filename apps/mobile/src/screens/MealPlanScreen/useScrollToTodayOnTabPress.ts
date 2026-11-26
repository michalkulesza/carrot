import { useEffect } from 'react'
import { useNavigation } from 'expo-router'

export const useScrollToTodayOnTabPress = (scrollToToday: (animated?: boolean) => void) => {
  const navigation = useNavigation()

  useEffect(() => {
    const tabNavigation = navigation.getParent()
    if (!tabNavigation) return

    return tabNavigation.addListener('tabPress' as never, () => scrollToToday(true))
  }, [navigation, scrollToToday])
}
