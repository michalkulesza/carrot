import { StyleSheet } from 'react-native'
import { palette, screenGutter, sectionGap, space, typography } from '../../theme'

const TONIGHT_HEIGHT = 150

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: space.xl,
    backgroundColor: palette.background,
  },
  errorText: { ...typography.body, color: palette.error, textAlign: 'center' },
  content: { paddingBottom: space.xxl + sectionGap },
  flexFill: { flex: 1, minWidth: 0 },

  tonightSection: { paddingTop: space.sm, paddingHorizontal: screenGutter },
  tonightCard: { height: TONIGHT_HEIGHT, justifyContent: 'flex-end' },
  tonightContent: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.md },
  tonightText: { flex: 1, minWidth: 0, gap: 2 },
  tonightEmptyCard: { gap: space.lg },
  tonightEmptyHeader: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  tonightEmptyActions: { flexDirection: 'row', gap: space.sm },
  tonightErrorRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },

  importsSection: { paddingTop: space.md, paddingHorizontal: screenGutter },
  importsCard: { padding: 0, paddingHorizontal: space.lg },
  importsHeader: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.lg },
  importsBody: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.dividerCard },
  importRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  importRowText: { flex: 1, minWidth: 0, gap: space.xs },
  importProgress: { paddingTop: space.xs },

  jumpSection: { paddingHorizontal: screenGutter },
  jumpCard: { padding: 0, paddingHorizontal: space.md },
  jumpRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  jumpRowText: { flex: 1, minWidth: 0, gap: space.xs },

  shelfContent: { paddingHorizontal: screenGutter },
  shelfSeparator: { width: space.md },

  emptySection: { paddingTop: sectionGap, paddingHorizontal: screenGutter },
  emptyCard: { alignItems: 'center', gap: space.lg, padding: space.xl },
  emptyText: { alignItems: 'center', gap: space.xs },
  emptyCentered: { textAlign: 'center' },
})
