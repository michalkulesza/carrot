import { PlatformColor, StyleSheet } from 'react-native'
import { colors } from '../../theme/colors'
import { DAY_ROW_HEIGHT, MONTH_HEADER_HEIGHT } from './helpers'

// DragPreviewCard has no date column or divider, but its thumbnail + title must land
// in the same spot on screen as they would inside the real row. Width of what it's
// standing in for: dayRowLeft (52) + dayRowDivider's marginHorizontal*2 + width (29).
const DAY_ROW_DATE_AND_DIVIDER_WIDTH = 52 + 29

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  safeArea: { flex: 1, backgroundColor: colors.background },
  visibleFrame: { flex: 1 },
  loadingOverlay: { position: 'absolute', top: 12, alignSelf: 'center' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  exportBtn: { padding: 4 },
  exportOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' },
  list: { flex: 1 },
  listContent: { paddingBottom: 16 },
  monthRow: {
    height: MONTH_HEADER_HEIGHT,
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 6,
    backgroundColor: colors.background,
  },
  monthRowLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.tertiaryLabel,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  dayRow: {
    height: DAY_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
    paddingHorizontal: 16,
  },
  dayRowToday: {
    borderLeftWidth: 3,
    borderLeftColor: colors.blue,
    paddingLeft: 13,
  },
  dayRowLeft: {
    width: 52,
    alignItems: 'center',
  },
  dayRowWeekday: {
    fontSize: 11,
    color: colors.tertiaryLabel,
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  dayRowNum: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.label,
    lineHeight: 24,
  },
  dayRowMonth: {
    fontSize: 10,
    color: colors.tertiaryLabel,
  },
  dayRowTextToday: {
    color: colors.blue,
  },
  dayRowDivider: {
    width: 1,
    height: 36,
    backgroundColor: colors.opaqueSeparator,
    marginHorizontal: 14,
  },
  dayRowContent: { flex: 1, marginLeft: 12 },
  dayRowRecipe: {
    fontSize: 16,
    color: colors.label,
    fontWeight: '500',
  },
  dayRowEmpty: {
    fontSize: 13,
    color: colors.opaqueSeparator,
  },
  dayRowThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  dayRowThumbPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: PlatformColor('systemGray5') as unknown as string,
  },
  dayRowDragHandle: {
    marginLeft: 8,
    width: 24,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dragPreviewCard: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    height: DAY_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingLeft: DAY_ROW_DATE_AND_DIVIDER_WIDTH,
    borderRadius: 12,
    backgroundColor: PlatformColor('secondarySystemBackground') as unknown as string,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  dragPreviewTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: colors.label,
  },
  dragPreviewThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    marginRight: 12,
  },
  dragPreviewThumbPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: PlatformColor('systemGray5') as unknown as string,
  },
  dropTargetHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: DAY_ROW_HEIGHT,
    backgroundColor: 'rgba(0, 122, 255, 0.08)',
  },
  todayBtn: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.orange,
  },
  todayBtnText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
})
