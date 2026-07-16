import type { StyleProp, ViewStyle } from 'react-native'
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native'
import GlassViewSafe, { glassAvailable } from './GlassViewSafe'
import { colors } from '../theme/colors'

// Falls back to a flat fill with a manual opacity dim where Liquid Glass isn't available (Android, pre-iOS 18).
const PrimaryButton = ({
  onPress,
  disabled,
  loading,
  label,
  accessibilityLabel,
  style,
}: {
  onPress: () => void
  disabled?: boolean
  loading?: boolean
  label: string
  accessibilityLabel: string
  style?: StyleProp<ViewStyle>
}) => (
  <Pressable
    style={({ pressed }) => [
      styles.primaryBtn,
      style,
      disabled && styles.btnDisabled,
      pressed && !glassAvailable && { opacity: 0.7 },
    ]}
    onPress={onPress}
    disabled={disabled}
    accessibilityLabel={accessibilityLabel}
  >
    <GlassViewSafe
      style={StyleSheet.absoluteFill}
      glassEffectStyle="regular"
      tintColor={colors.blue}
      isInteractive
    />
    {loading ? (
      <ActivityIndicator color={colors.background} size="small" />
    ) : (
      <Text style={styles.primaryBtnText}>{label}</Text>
    )}
  </Pressable>
)

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
