import { useEffect, useState } from 'react'
import { useNavigation } from 'expo-router'
import type { ParamListBase } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

// InteractionManager.runAfterInteractions is a setImmediate stub in RN 0.85, so it would fire mid-push; a timer covers screens that never get a transition.
const NO_TRANSITION_FALLBACK_MS = 700

export const useAfterTransition = () => {
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (ready) return

    const markReady = () => setReady(true)
    const unsubscribe = navigation.addListener('transitionEnd', markReady)
    const fallback = setTimeout(markReady, NO_TRANSITION_FALLBACK_MS)

    return () => {
      unsubscribe()
      clearTimeout(fallback)
    }
  }, [navigation, ready])

  return ready
}
