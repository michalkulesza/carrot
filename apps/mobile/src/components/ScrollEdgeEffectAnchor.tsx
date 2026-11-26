import { StyleSheet } from 'react-native'
import { SymbolView } from 'expo-symbols'

// iOS 26 only draws the nav bar's scroll-edge blur when the custom title view contains a native image; this invisible symbol satisfies it.
const ScrollEdgeEffectAnchor = () => (
  <SymbolView name="circle" size={1} tintColor="transparent" style={styles.anchor} pointerEvents="none" />
)

export default ScrollEdgeEffectAnchor

const styles = StyleSheet.create({
  anchor: { position: 'absolute', width: 1, height: 1 },
})
