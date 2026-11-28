import { StyleSheet } from 'react-native'
import { space } from '../../theme'

export const styles = StyleSheet.create({
  body: { paddingHorizontal: space.xl, paddingTop: space.sm, gap: space.lg },
  title: { textAlign: 'center', fontWeight: '700' },
  message: { textAlign: 'center' },
  inputRow: { flexDirection: 'row' },
  menuContent: { paddingHorizontal: space.sm },
})
