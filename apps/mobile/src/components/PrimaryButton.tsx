import type { StyleProp, ViewStyle } from 'react-native'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import GlassViewSafe, { glassAvailable } from './GlassViewSafe'
import { colors } from '../theme/colors'

// Falls back to a flat fill with a manual opacity dim where Liquid Glass isn't available (Android, pre-iOS 18).
const PrimaryButton = ({
  onPress,
  disabled,
  loading,
  label,
  accessibilityLabel,
  tintColor = colors.blue,
  disabledTintColor,
  disabledTextColor,
  disabledBorderColor,
  style,
}: {
  onPress: () => void
  disabled?: boolean
  loading?: boolean
  label: string
  accessibilityLabel: string
  tintColor?: string
  disabledTintColor?: string
  disabledTextColor?: string
  disabledBorderColor?: string
  style?: StyleProp<ViewStyle>
}) => {
  const buttonTintColor = disabled && disabledTintColor ? disabledTintColor : tintColor
  const disabledButtonTextColor = disabled && disabledTextColor ? disabledTextColor : undefined
  const shouldUseGlassEffect = !disabled || !disabledTintColor

  return (
    <Pressable
      style={({ pressed }) => [
        styles.primaryBtn,
        { backgroundColor: buttonTintColor },
        disabled && disabledBorderColor && { borderWidth: StyleSheet.hairlineWidth, borderColor: disabledBorderColor },
        style,
        disabled && !disabledTintColor && styles.btnDisabled,
        pressed && !glassAvailable && { opacity: 0.7 },
      ]}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        onPress()
      }}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
    >
      {shouldUseGlassEffect ? (
        <GlassViewSafe
          style={StyleSheet.absoluteFill}
          glassEffectStyle="regular"
          tintColor={buttonTintColor}
          isInteractive
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: buttonTintColor }]} />
      )}
      {loading ? (
        <ActivityIndicator color={disabledButtonTextColor ?? '#ffffff'} size="small" />
      ) : (
        <Text style={[styles.primaryBtnText, disabledButtonTextColor && { color: disabledButtonTextColor }]}>
          {label}
        </Text>
      )}
    </Pressable>
  )
}

export default PrimaryButton

const styles = StyleSheet.create({
  primaryBtn: {
    backgroundColor: colors.blue,
    borderRadius: 999,
    overflow: 'hidden',
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  primaryBtnText: { fontSize: 16, color: '#fff', fontWeight: '600' },
  btnDisabled: { opacity: 0.4 },
})
