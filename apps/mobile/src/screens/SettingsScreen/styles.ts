import { StyleSheet } from 'react-native'
import { palette, radius, screenGutter, space } from '../../theme'

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  profileCard: {
    marginHorizontal: screenGutter,
    marginTop: space.xs,
    padding: space.lg,
    gap: space.md,
    borderRadius: radius.card,
    backgroundColor: palette.tint,
  },
  profileHeader: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  profileText: { flex: 1, minWidth: 0 },
  statRow: { flexDirection: 'row', gap: space.sm },
  centered: { alignItems: 'center', paddingVertical: space.lg },
  errorBlock: { marginHorizontal: screenGutter, paddingVertical: space.lg, gap: space.md, alignItems: 'flex-start' },
  footerRow: { flexDirection: 'row', gap: space.sm },
  footerButton: { flex: 1 },
  segment: { flexShrink: 1, maxWidth: 240 },
  segmentStacked: { alignSelf: 'stretch' },
})
