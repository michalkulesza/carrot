import { useEffect, useRef } from 'react'
import type { TextInput } from 'react-native'
import { useNavigation } from 'expo-router'

export const useFocusSearchOnTabPress = () => {
  const navigation = useNavigation()
  const searchInputRef = useRef<TextInput>(null)

  useEffect(() => {
    const tabNavigation = navigation.getParent()
    if (!tabNavigation) return

    let frame = 0
    const unsubscribe = tabNavigation.addListener('tabPress' as never, () => {
      cancelAnimationFrame(frame)
      // The tab switch must finish before the input can take focus.
      frame = requestAnimationFrame(() => searchInputRef.current?.focus())
    })

    return () => {
      cancelAnimationFrame(frame)
      unsubscribe()
    }
  }, [navigation])

  return searchInputRef
}
