import { StyleSheet, Text } from 'react-native'
import { useResolvedColorScheme } from '../context/ColorSchemeContext'

// iOS native-stack ignores headerTitleAlign for plain string titles and always
// centers them; rendering the title as a full-width, left-aligned custom
// headerTitle component is the only reliable way to left-align it.
const HeaderTitle = ({ title, color }: { title: string; color?: string }) => {
  const colorScheme = useResolvedColorScheme()
  const titleColor = color ?? (colorScheme === 'dark' ? '#ffffff' : '#000000')

  return (
    <Text style={[styles.title, { color: titleColor }]} numberOfLines={1}>
      {title}
    </Text>
  )
}

export default HeaderTitle

const styles = StyleSheet.create({
  title: {
    width: '100%',
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
  },
})
