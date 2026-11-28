import { StyleSheet } from 'react-native'
import { palette, screenGutter, space } from '../../theme'

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  list: { flex: 1 },
  content: { paddingHorizontal: screenGutter, paddingBottom: space.xxl },
  header: { gap: space.lg, paddingTop: space.xs, paddingBottom: space.xs },
  caption: { paddingHorizontal: space.xs },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xxl, paddingTop: space.xxl },
  message: { textAlign: 'center' },
})
