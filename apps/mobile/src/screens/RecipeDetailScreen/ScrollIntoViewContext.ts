import { createContext } from 'react'
import type { View } from 'react-native'

export interface ScrollIntoViewActions {
  scrollIntoView: (target: View | null) => void
  release: () => void
}

export const ScrollIntoViewContext = createContext<ScrollIntoViewActions>({
  scrollIntoView: () => undefined,
  release: () => undefined,
})
