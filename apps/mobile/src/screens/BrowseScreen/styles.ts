import { StyleSheet } from 'react-native'
import { palette, screenGutter, space } from '../../theme'

export const styles = StyleSheet.create({
  searchField: { paddingHorizontal: screenGutter },
  screen: { flex: 1, backgroundColor: palette.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: space.xl, backgroundColor: palette.background },
  errorText: { textAlign: 'center' },
  listContent: { paddingBottom: space.lg },
})
