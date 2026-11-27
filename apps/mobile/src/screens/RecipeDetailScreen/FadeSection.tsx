import type { ReactNode } from 'react'
import Animated from 'react-native-reanimated'
import { useMotion } from '../../theme'

interface FadeSectionProps {
  animate?: boolean
  children: ReactNode
}

const FadeSection = ({ animate = true, children }: FadeSectionProps) => {
  const { entering } = useMotion()
  const enteringAnimation = animate ? entering : undefined

  return <Animated.View entering={enteringAnimation}>{children}</Animated.View>
}

export default FadeSection
