import { StyleSheet } from 'react-native'
import { palette, radius, screenGutter, space } from '../../theme'

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  noticeBold: { fontWeight: '700' },
  inset: { marginHorizontal: screenGutter },
  summary: {
    marginHorizontal: screenGutter,
    marginTop: space.lg,
    paddingVertical: space.md + 2,
    paddingHorizontal: space.lg,
    gap: space.xs,
    borderRadius: radius.card,
    backgroundColor: palette.card,
  },
  checkSlot: { marginHorizontal: screenGutter, marginTop: space.sm },
  checkCard: { paddingVertical: space.md, paddingHorizontal: space.md + 2, borderRadius: radius.control, gap: space.sm },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: space.md - 2 },
  checkRunning: { backgroundColor: palette.tint },
  checkDone: { backgroundColor: palette.successBg },
  checkFailed: { backgroundColor: palette.errorBg },
  checkBadge: { width: 20, height: 20, borderRadius: radius.round, alignItems: 'center', justifyContent: 'center' },
  checkBadgeDone: { backgroundColor: palette.success },
  checkBadgeFailed: { backgroundColor: palette.error },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginHorizontal: screenGutter },
  flex: { flex: 1 },
})
