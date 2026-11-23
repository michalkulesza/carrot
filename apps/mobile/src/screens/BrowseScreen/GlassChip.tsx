import { memo, type ReactNode } from 'react'
import { Pressable, type PressableProps, type StyleProp, StyleSheet, type ViewStyle } from 'react-native'
import GlassViewSafe, { glassAvailable } from '../../components/GlassViewSafe'
import { colors } from '../../theme/colors'

interface GlassChipProps extends Omit<PressableProps, 'style' | 'children'> {
  selected: boolean
  style: StyleProp<ViewStyle>
  children: ReactNode
}

const getTintColor = (selected: boolean) => {
  if (selected) return colors.blue

  return glassAvailable ? undefined : colors.gray5
}

const GlassChip = ({ selected, style, children, ...pressableProps }: GlassChipProps) => (
  <Pressable style={[style, chipStyles.clip]} {...pressableProps}>
    <GlassViewSafe
      style={StyleSheet.absoluteFill}
      glassEffectStyle="regular"
      tintColor={getTintColor(selected)}
      isInteractive
    />
    {children}
  </Pressable>
)

const chipStyles = StyleSheet.create({
  clip: { overflow: 'hidden' },
})

export default memo(GlassChip)
