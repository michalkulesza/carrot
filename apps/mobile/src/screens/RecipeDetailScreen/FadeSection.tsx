import type { ReactNode } from 'react'
import Animated from 'react-native-reanimated'
import { useMotion } from '../../theme'

const FadeSection = ({ children }: { children: ReactNode }) => {
  const { entering } = useMotion()

  return <Animated.View entering={entering}>{children}</Animated.View>
}

export default FadeSection
