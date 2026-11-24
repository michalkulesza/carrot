import { memo, useCallback } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated'
import { SymbolView } from 'expo-symbols'
import { palette } from '../../theme'
import { lightHaptic } from './haptics'

interface FavouriteButtonProps {
  favourite: boolean
  onToggle: () => void
  accessibilityLabel: string
}

const SYMBOL_SIZE = 22
const HIT_SLOP = { top: 2, bottom: 2, left: 2, right: 2 }
const POP_SCALE = 1.2
const POP_HALF_DURATION = 100

const FavouriteButton = ({ favourite, onToggle, accessibilityLabel }: FavouriteButtonProps) => {
  const reduceMotion = useReducedMotion()
  const scale = useSharedValue(1)

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  const handlePress = useCallback(() => {
    lightHaptic()
    if (!reduceMotion) {
      scale.value = withSequence(
        withTiming(POP_SCALE, { duration: POP_HALF_DURATION }),
        withTiming(1, { duration: POP_HALF_DURATION }),
      )
    }
    onToggle()
  }, [onToggle, reduceMotion, scale])

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={HIT_SLOP}
      style={styles.target}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: favourite }}
    >
      <Animated.View style={animatedStyle}>
        <SymbolView
          name={favourite ? 'star.fill' : 'star'}
          size={SYMBOL_SIZE}
          tintColor={favourite ? palette.action : palette.placeholder}
        />
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  target: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
})

export default memo(FavouriteButton)
