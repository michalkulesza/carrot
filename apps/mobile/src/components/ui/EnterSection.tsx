import { useMemo, type ReactNode } from 'react'
import Animated from 'react-native-reanimated'
import { useMotion } from '../../theme'

interface EnterSectionProps {
  index?: number
  children: ReactNode
}

const STAGGER_MS = 40

const EnterSection = ({ index = 0, children }: EnterSectionProps) => {
  const { entering } = useMotion()
  const staggered = useMemo(() => entering?.delay(index * STAGGER_MS), [entering, index])

  return <Animated.View entering={staggered}>{children}</Animated.View>
}

export default EnterSection
