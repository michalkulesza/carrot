import { useCallback, useMemo, useRef } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { SymbolView, SFSymbol } from 'expo-symbols'
import { palette, PaletteKey, radius, space, typography, usePressScale } from '../../theme'
import { lightHaptic } from './haptics'

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'danger' | 'text' | 'onImage' | 'dark'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl'

interface ButtonProps {
  label: string
  onPress: () => void | Promise<unknown>
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: SFSymbol
  fullWidth?: boolean
  loading?: boolean
  disabled?: boolean
  accessibilityLabel?: string
}

const HEIGHTS: Record<ButtonSize, number> = { sm: 34, md: 38, lg: 44, xl: 54 }
const MIN_TARGET = 44

const BACKGROUNDS: Record<ButtonVariant, string> = {
  primary: palette.action,
  secondary: palette.control,
  destructive: palette.errorBg,
  danger: palette.error,
  text: 'transparent',
  onImage: palette.onImage,
  dark: palette.ink,
}

const FOREGROUNDS: Record<ButtonVariant, string> = {
  primary: palette.onAction,
  secondary: palette.ink,
  destructive: palette.error,
  danger: palette.onAction,
  text: palette.actionText,
  onImage: palette.onImageText,
  dark: palette.background,
}

const DISABLED_FOREGROUNDS: Partial<Record<ButtonVariant, PaletteKey>> = {
  secondary: 'placeholder',
  text: 'placeholder',
}

const Button = ({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  fullWidth,
  loading,
  disabled,
  accessibilityLabel,
}: ButtonProps) => {
  const pending = useRef(false)
  const { animatedStyle, onPressIn, onPressOut } = usePressScale()

  const height = HEIGHTS[size]
  const inactive = Boolean(disabled || loading)
  const hitSlopInset = Math.max(0, (MIN_TARGET - height) / 2)
  const hitSlop = useMemo(
    () => ({ top: hitSlopInset, bottom: hitSlopInset, left: hitSlopInset, right: hitSlopInset }),
    [hitSlopInset],
  )

  const disabledForeground = DISABLED_FOREGROUNDS[variant]
  const foreground = disabled && disabledForeground ? palette[disabledForeground] : FOREGROUNDS[variant]
  const background = disabled && variant === 'primary' ? palette.actionDisabled : BACKGROUNDS[variant]
  const labelTypography = size === 'xl' ? typography.buttonLarge : typography.button
  const horizontalPadding = variant === 'text' ? space.xs : size === 'sm' ? space.md : space.lg

  const handlePress = useCallback(async () => {
    if (pending.current) return
    pending.current = true
    lightHaptic()

    try {
      await onPress()
    } finally {
      pending.current = false
    }
  }, [onPress])

  const containerStyle = useMemo(
    () => [
      styles.container,
      { height, backgroundColor: background, paddingHorizontal: horizontalPadding },
      fullWidth && styles.fullWidth,
      animatedStyle,
    ],
    [height, background, horizontalPadding, fullWidth, animatedStyle],
  )

  const accessibilityState = useMemo(() => ({ disabled: inactive, busy: loading }), [inactive, loading])

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={inactive}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={accessibilityState}
      style={fullWidth ? styles.fullWidth : undefined}
    >
      <Animated.View style={containerStyle}>
        {loading ? (
          <ActivityIndicator color={foreground} />
        ) : (
          <View style={styles.content}>
            {icon ? <SymbolView name={icon} size={labelTypography.fontSize} tintColor={foreground} /> : null}
            <Text style={[labelTypography, { color: foreground }]} numberOfLines={1}>
              {label}
            </Text>
          </View>
        )}
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
  fullWidth: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
})

export default Button
