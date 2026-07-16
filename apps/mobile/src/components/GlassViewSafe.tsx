import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect'
import type { ComponentProps } from 'react'
import { View } from 'react-native'
import { useResolvedColorScheme } from '../context/ColorSchemeContext'

export const glassAvailable = isGlassEffectAPIAvailable()

const GlassViewSafe = (props: ComponentProps<typeof GlassView>) => {
  const resolvedColorScheme = useResolvedColorScheme()
  return glassAvailable ? (
    <GlassView colorScheme={resolvedColorScheme} {...props} />
  ) : (
    <View {...props} />
  )
}

export default GlassViewSafe
