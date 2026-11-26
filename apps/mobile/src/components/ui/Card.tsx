import { ReactNode, useMemo } from 'react'
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import Animated from 'react-native-reanimated'
import { palette, PaletteKey, radius, space, SpaceKey, usePressScale } from '../../theme'
import { lightHaptic } from './haptics'

export type CardTone = 'default' | 'error' | 'attention' | 'plain'

interface CardProps {
  tone?: CardTone
  padding?: SpaceKey
  onPress?: () => void
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
  children?: ReactNode
}

const TONE_BACKGROUNDS: Record<CardTone, PaletteKey | null> = {
  default: 'card',
  error: 'errorBg',
  attention: 'tint',
  plain: null,
}

const Card = ({ tone = 'default', padding = 'lg', onPress, accessibilityLabel, style, children }: CardProps) => {
  const { animatedStyle, onPressIn, onPressOut } = usePressScale()
  const backgroundKey = TONE_BACKGROUNDS[tone]

  const cardStyle = useMemo(
    () => [
      styles.card,
      { padding: space[padding], backgroundColor: backgroundKey ? palette[backgroundKey] : undefined },
      style,
    ],
    [padding, backgroundKey, style],
  )

  const handlePress = () => {
    lightHaptic()
    onPress?.()
  }

  if (!onPress) return <View style={cardStyle}>{children}</View>

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View style={[cardStyle, animatedStyle]}>{children}</Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, overflow: 'hidden' },
})

export default Card
