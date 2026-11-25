import { StyleSheet } from 'react-native'
import { palette, radius, space, typography } from '../../theme'

const INPUT_HEIGHT = 44
const SOURCE_TILE = 44
const PERSONAL_SEARCH_HEIGHT = 44

export const styles = StyleSheet.create({
  sheetBody: { flex: 1, paddingHorizontal: space.xl, paddingTop: space.sm, gap: space.lg },
  sheetTitle: { textAlign: 'center', fontWeight: '700' },

  inputRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  fieldInput: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    flex: 1,
    height: INPUT_HEIGHT,
    borderWidth: 1,
    paddingHorizontal: space.md + 2,
    color: palette.ink,
  },
  areaInput: {
    ...typography.body,
    flex: 1,
    borderWidth: 1,
    backgroundColor: palette.card,
    padding: space.lg,
    color: palette.ink,
    textAlignVertical: 'top',
  },
  areaInputFocused: { backgroundColor: palette.background },

  sourceCard: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  sourceTile: {
    width: SOURCE_TILE,
    height: SOURCE_TILE,
    borderRadius: radius.control - 2,
    backgroundColor: palette.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceText: { flex: 1, gap: 2 },
  sourceName: { fontWeight: '600' },
  footnote: { textAlign: 'center' },

  pasteRow: { flexDirection: 'row', justifyContent: 'flex-end' },

  personalList: { paddingHorizontal: space.xl, gap: space.md },
  personalHeader: { gap: space.lg, paddingBottom: space.sm },
  personalSearch: {
    ...typography.body,
    height: PERSONAL_SEARCH_HEIGHT,
    borderRadius: radius.control,
    paddingHorizontal: space.lg,
    backgroundColor: palette.control,
    color: palette.ink,
  },
  personalLoading: { paddingVertical: space.xxl + space.sm },
  personalRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  personalRowPressed: { opacity: 0.55 },
  personalTitle: { flex: 1 },
  personalSeparator: { height: StyleSheet.hairlineWidth, backgroundColor: palette.dividerCard },
  personalEmpty: { paddingVertical: space.xxl, textAlign: 'center' },
})
