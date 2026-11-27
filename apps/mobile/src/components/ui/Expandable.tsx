import { ReactNode, useCallback, useEffect } from 'react'
import { type LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native'
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated'
import { SymbolView } from 'expo-symbols'
import { useLatchedTrue } from '../../hooks/useLatchedTrue'
import { expandTiming, palette, space } from '../../theme'
import { lightHaptic } from './haptics'

interface ExpandableProps {
  header: ReactNode
  expanded: boolean
  onToggle: () => void
  accessibilityLabel?: string
  unclipWhenExpanded?: boolean
  lazy?: boolean
  children?: ReactNode
}

const CHEVRON_SIZE = 14

const Expandable = ({
  header,
  expanded,
  onToggle,
  accessibilityLabel,
  unclipWhenExpanded = false,
  lazy = false,
  children,
}: ExpandableProps) => {
  const reduceMotion = useReducedMotion()
  const hasExpanded = useLatchedTrue(expanded)
  const mountChildren = !lazy || hasExpanded
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
    overflow: unclipWhenExpanded && progress.value === 1 ? 'visible' : 'hidden',
  }))

  const handleContentLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const nextHeight = event.nativeEvent.layout.height
      const isFirstMeasure = contentHeight.value === 0

      // Content is absolutely positioned, so rows added or removed would otherwise snap the clip height.
      contentHeight.value = isFirstMeasure || reduceMotion ? nextHeight : withTiming(nextHeight, expandTiming)
    },
    [contentHeight, reduceMotion],
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
          {mountChildren ? children : null}
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
