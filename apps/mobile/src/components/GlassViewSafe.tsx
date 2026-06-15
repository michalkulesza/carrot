import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect'
import type { ComponentProps } from 'react'
import { View } from 'react-native'

const glassAvailable = isGlassEffectAPIAvailable()

const GlassViewSafe = (props: ComponentProps<typeof GlassView>) =>
  glassAvailable ? <GlassView {...props} /> : <View {...props} />

export default GlassViewSafe
