import { StyleSheet, Text, View } from 'react-native'
import { palette, radius } from '../theme'

export const getInitials = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean)

  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase()
  }

  return (words[0] ?? '').slice(0, 2).toUpperCase()
}

type AvatarShape = 'circle' | 'rounded'

interface AvatarProps {
  name: string
  label?: string
  color?: string
  size?: number
  shape?: AvatarShape
}

const ROUNDED_RATIO = 0.28
const INITIALS_RATIO = 0.4
const INITIALS_FONT_SIZES = [11, 12, 13, 16, 17, 20, 22]

const initialsFontSize = (size: number) =>
  INITIALS_FONT_SIZES.reduce((best, candidate) =>
    Math.abs(candidate - size * INITIALS_RATIO) < Math.abs(best - size * INITIALS_RATIO) ? candidate : best,
  )

const Avatar = ({ name, label, color, size = 32, shape = 'circle' }: AvatarProps) => {
  const borderRadius = shape === 'rounded' ? Math.min(radius.control, size * ROUNDED_RATIO) : size / 2
  const dimensionStyle = { width: size, height: size, borderRadius }

  return (
    <View style={[styles.circle, dimensionStyle, color ? { backgroundColor: color } : styles.circlePersonal]}>
      <Text style={[styles.text, !color && styles.textPersonal, { fontSize: initialsFontSize(size) }]}>
        {label ?? getInitials(name)}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  circlePersonal: { backgroundColor: palette.dividerStrong },
  text: { fontWeight: '700', color: palette.onImage },
  textPersonal: { color: palette.textSecondary },
})

export default Avatar
