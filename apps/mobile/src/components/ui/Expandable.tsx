import { ReactNode, useCallback, useEffect } from 'react'
import { type LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native'
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated'
import { SymbolView } from 'expo-symbols'
import { expandTiming, palette, space } from '../../theme'
import { lightHaptic } from './haptics'

interface ExpandableProps {
  header: ReactNode
  expanded: boolean
  onToggle: () => void
  accessibilityLabel?: string
  children?: ReactNode
}

const CHEVRON_SIZE = 14

const Expandable = ({ header, expanded, onToggle, accessibilityLabel, children }: ExpandableProps) => {
  const reduceMotion = useReducedMotion()
  const progress = useSharedValue(expanded ? 1 : 0)
  const contentHeight = useSharedValue(0)

  useEffect(() => {
    const target = expanded ? 1 : 0
    progress.value = reduceMotion ? target : withTiming(target, expandTiming)
  }, [expanded, progress, reduceMotion])

  const chevronStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${progress.value * 180}deg` }] }))

  const bodyStyle = useAnimatedStyle(() => ({
    height: progress.value * contentHeight.value,
    opacity: progress.value,
  }))

  const handleContentLayout = useCallback(
    (event: LayoutChangeEvent) => {
      contentHeight.value = event.nativeEvent.layout.height
    },
    [contentHeight],
  )

  const handleToggle = () => {
    lightHaptic()
    onToggle()
  }

  return (
    <View>
      <Pressable
        onPress={handleToggle}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded }}
      >
        <View style={styles.header}>
          <View style={styles.headerContent}>{header}</View>
          <Animated.View style={chevronStyle}>
            <SymbolView name="chevron.down" size={CHEVRON_SIZE} weight="semibold" tintColor={palette.textTertiary} />
          </Animated.View>
        </View>
      </Pressable>
      <Animated.View
        style={[styles.body, bodyStyle]}
        pointerEvents={expanded ? 'auto' : 'none'}
        accessibilityElementsHidden={!expanded}
        importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
      >
        <View style={styles.bodyContent} onLayout={handleContentLayout}>
          {children}
        </View>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  headerContent: { flex: 1 },
  body: { overflow: 'hidden' },
  bodyContent: { position: 'absolute', top: 0, left: 0, right: 0 },
})

export default Expandable
