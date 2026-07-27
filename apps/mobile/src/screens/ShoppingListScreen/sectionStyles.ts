import { StyleSheet } from 'react-native'
import { colors } from '../../theme/colors'

export const sectionStyles = StyleSheet.create({
  header: {
    alignItems: 'center',
    borderBottomColor: colors.separator,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  title: { color: colors.label, fontSize: 17, lineHeight: 22, fontWeight: '600' },
  count: { color: colors.secondaryLabel, fontSize: 13, lineHeight: 18 },
  clearCompleted: { alignItems: 'flex-end', paddingHorizontal: 16, paddingTop: 8 },
})
