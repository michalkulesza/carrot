import { memo } from 'react'
import { Pressable, Text } from 'react-native'
import Animated from 'react-native-reanimated'
import { SymbolView, type SFSymbol } from 'expo-symbols'
import { palette, usePressScale } from '../../theme'
import { PILL_HIT_SLOP } from './groceryLayout'
import { styles } from './styles'

interface HeaderPillButtonProps {
  label: string
  tone: 'tint' | 'neutral'
  icon?: SFSymbol
  onPress: () => void
}

const HeaderPillButton = ({ label, tone, icon, onPress }: HeaderPillButtonProps) => {
  const { animatedStyle, onPressIn, onPressOut } = usePressScale()

  const isTint = tone === 'tint'
  const foreground = isTint ? palette.actionText : palette.ink
  const pillStyle = [styles.headerPill, isTint ? styles.headerPillTint : styles.headerPillNeutral, animatedStyle]
  const labelStyle = isTint ? styles.headerPillTintText : styles.headerPillNeutralText

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      hitSlop={PILL_HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Animated.View style={pillStyle}>
        {icon ? <SymbolView name={icon} size={16} tintColor={foreground} /> : null}
        <Text style={labelStyle} numberOfLines={1}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  )
}

export default memo(HeaderPillButton)
