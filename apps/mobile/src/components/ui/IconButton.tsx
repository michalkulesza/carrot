import { useCallback, useMemo } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import Animated from 'react-native-reanimated'
import { SymbolView, SFSymbol } from 'expo-symbols'
import GlassViewSafe, { glassAvailable } from '../GlassViewSafe'
import { palette, radius, usePressScale } from '../../theme'
import { lightHaptic } from './haptics'

export type IconButtonVariant = 'primary' | 'control' | 'glass'
export type IconButtonSize = 40 | 44

interface IconButtonProps {
  icon: SFSymbol
  onPress?: () => void | Promise<unknown>
  accessibilityLabel: string
  variant?: IconButtonVariant
  size?: IconButtonSize
  disabled?: boolean
}

const ICON_SIZE = 18
const GLASS_FALLBACK = 'rgba(255,255,255,0.78)'

const BACKGROUNDS = {
  primary: palette.action,
  control: palette.control,
  glass: palette.control,
}

const FOREGROUNDS = {
  primary: palette.onAction,
  control: palette.ink,
  glass: palette.ink,
}

const IconButton = ({
  icon,
  onPress,
  accessibilityLabel,
  variant = 'control',
  size = 40,
  disabled,
}: IconButtonProps) => {
  const { animatedStyle: pressStyle, onPressIn, onPressOut } = usePressScale()
  const hitSlopInset = (44 - size) / 2

  const handlePress = useCallback(() => {
    lightHaptic()
    onPress?.()
  }, [onPress])

  const hitSlop = useMemo(
    () => ({ top: hitSlopInset, bottom: hitSlopInset, left: hitSlopInset, right: hitSlopInset }),
    [hitSlopInset],
  )

  const useGlass = variant === 'glass' && glassAvailable
  const background = variant === 'glass' ? GLASS_FALLBACK : BACKGROUNDS[variant]
  const circleStyle = useMemo(
    () => [
      styles.circle,
      { width: size, height: size },
      !useGlass && { backgroundColor: background },
      pressStyle,
    ],
    [size, useGlass, background, pressStyle],
  )

  const circle = (
    <Animated.View style={circleStyle}>
      {useGlass ? <GlassViewSafe style={StyleSheet.absoluteFill} /> : null}
      <SymbolView name={icon} size={ICON_SIZE} weight="semibold" tintColor={FOREGROUNDS[variant]} />
    </Animated.View>
  )

  if (!onPress) {
    return (
      <Animated.View accessible accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
        {circle}
      </Animated.View>
    )
  }

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
    >
      {circle}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  circle: { borderRadius: radius.round, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
})

export default IconButton
