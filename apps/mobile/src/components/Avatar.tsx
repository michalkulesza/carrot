import { StyleSheet, Text, View } from 'react-native'
import { colors } from '../theme/colors'

export const getInitials = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean)

  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase()
  }

  return (words[0] ?? '').slice(0, 2).toUpperCase()
}

const Avatar = ({ name, color, size = 32 }: { name: string; color?: string; size?: number }) => {
  const dimensionStyle = { width: size, height: size, borderRadius: size / 2 }

  return (
    <View style={[styles.circle, dimensionStyle, color ? { backgroundColor: color } : styles.circlePersonal]}>
      <Text style={[styles.text, !color && styles.textPersonal, { fontSize: size * 0.4 }]}>
        {getInitials(name)}
      </Text>
    </View>
  )
}

export default Avatar

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  circlePersonal: { backgroundColor: colors.opaqueSeparator },
  text: { fontWeight: '700', color: '#ffffff' },
  textPersonal: { color: colors.secondaryLabel },
})
