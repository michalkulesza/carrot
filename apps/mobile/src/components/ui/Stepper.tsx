import { memo, useCallback } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { SymbolView } from 'expo-symbols'
import AppText from './AppText'
import RollingNumber from './RollingNumber'
import { palette, radius, space, typography, usePressScale } from '../../theme'
import { selectionHaptic } from './haptics'

interface StepperProps {
  label: string
  value: number
  onDecrease: () => void
  onIncrease: () => void
  canDecrease: boolean
  canIncrease: boolean
  decreaseLabel: string
  increaseLabel: string
  valueLabel: string
}

const HEIGHT = 54
const BUTTON_SIZE = 42
const VALUE_WIDTH = 32
const ICON_SIZE = 16

interface StepperButtonProps {
  icon: 'minus' | 'plus'
  onPress: () => void
  disabled: boolean
  accessibilityLabel: string
}

const StepperButton = ({ icon, onPress, disabled, accessibilityLabel }: StepperButtonProps) => {
  const { animatedStyle, onPressIn, onPressOut } = usePressScale()

  const handlePress = useCallback(() => {
    selectionHaptic()
    onPress()
  }, [onPress])

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      hitSlop={1}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
    >
      <Animated.View style={[styles.button, animatedStyle]}>
        <SymbolView
          name={icon}
          size={ICON_SIZE}
          weight="semibold"
          tintColor={disabled ? palette.placeholder : palette.ink}
        />
      </Animated.View>
    </Pressable>
  )
}

const Stepper = ({
  label,
  value,
  onDecrease,
  onIncrease,
  canDecrease,
  canIncrease,
  decreaseLabel,
  increaseLabel,
  valueLabel,
}: StepperProps) => {
  return (
    <View style={styles.container}>
      <AppText variant="controlLabel">{label}</AppText>
      <View style={styles.controls}>
        <StepperButton icon="minus" onPress={onDecrease} disabled={!canDecrease} accessibilityLabel={decreaseLabel} />
        <View style={styles.valueBox}>
          <RollingNumber
            value={value}
            lineHeight={typography.stepperValue.lineHeight}
            style={styles.value}
            accessibilityLabel={valueLabel}
          />
        </View>
        <StepperButton icon="plus" onPress={onIncrease} disabled={!canIncrease} accessibilityLabel={increaseLabel} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    height: HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: space.lg,
    paddingRight: 6,
    borderRadius: radius.control,
    backgroundColor: palette.control,
  },
  controls: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: radius.input,
    backgroundColor: palette.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueBox: { width: VALUE_WIDTH, alignItems: 'center' },
  value: { ...typography.stepperValue, ...typography.tabularNums, color: palette.ink },
})

export default memo(Stepper)
