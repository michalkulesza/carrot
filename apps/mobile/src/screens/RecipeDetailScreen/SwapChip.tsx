import { memo, useMemo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { SymbolView } from 'expo-symbols'
import { palette } from '../../theme'
import { styles } from './styles'

const ICON_SIZE = 12
const HIT_SLOP = { top: 7, bottom: 7, left: 4, right: 4 }

interface SwapChipFaceProps {
  label: string
  highlighted?: boolean
}

const SwapChipFace = memo(({ label, highlighted = false }: SwapChipFaceProps) => {
  const faceStyle = useMemo(() => [styles.swapChip, highlighted && styles.swapChipActive], [highlighted])

  return (
    <View style={faceStyle}>
      <Text style={styles.swapChipText}>{label}</Text>
      <SymbolView name="arrow.left.arrow.right" size={ICON_SIZE} tintColor={palette.allergenText} />
    </View>
  )
})
SwapChipFace.displayName = 'SwapChipFace'

export const StaticSwapChip = memo(({ label }: { label: string }) => (
  <View style={styles.swapChipWrapper}>
    <SwapChipFace label={label} />
  </View>
))
StaticSwapChip.displayName = 'StaticSwapChip'

interface SwapChipProps extends SwapChipFaceProps {
  accessibilityLabel: string
  disabled: boolean
  onPress: () => void
}

const SwapChip = ({ label, highlighted, accessibilityLabel, disabled, onPress }: SwapChipProps) => {
  const accessibilityState = useMemo(() => ({ disabled }), [disabled])

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      style={styles.swapChipWrapper}
    >
      <SwapChipFace label={label} highlighted={highlighted} />
    </Pressable>
  )
}

export default memo(SwapChip)
