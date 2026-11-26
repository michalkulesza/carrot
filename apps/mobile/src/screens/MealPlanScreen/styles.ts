import { StyleSheet } from 'react-native'
import { palette, radius, typography } from '../../theme'
import { PREVIEW_HEIGHT } from './useDragToMove'

export const DISH_THUMB_SIZE = 48

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  scroll: { flex: 1 },
  loadingOverlay: { position: 'absolute', alignSelf: 'center' },
  headerTitle: { width: '100%', justifyContent: 'center' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  exportBtn: { padding: 4 },
  exportBtnPressed: { opacity: 0.7 },
  exportOverlay: { flex: 1, backgroundColor: palette.backdrop, justifyContent: 'center', alignItems: 'center' },

  days: { paddingHorizontal: 20, gap: 8 },
  loadWeekButton: { height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  loadWeekLabel: { ...typography.chip, color: palette.textSecondary },
  weekHeader: { ...typography.caption, color: palette.textSecondary, paddingTop: 12, paddingBottom: 4, paddingHorizontal: 4 },

  dayCard: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 12,
    paddingRight: 14,
    paddingBottom: 12,
    paddingLeft: 12,
    borderRadius: radius.card,
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: palette.card,
  },
  dayCardToday: { backgroundColor: palette.todayCard, borderColor: palette.action },
  dayCardDropTarget: { borderColor: palette.action },
  dayCardPast: { opacity: 0.55 },
  dateColumn: { width: DISH_THUMB_SIZE, alignItems: 'center', paddingTop: 2 },
  weekday: {
    ...typography.badge,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.72,
    color: palette.textSecondary,
  },
  dayNumber: { ...typography.timerValue, ...typography.tabularNums, color: palette.ink },
  dateTextToday: { color: palette.actionText },
  dishes: { flex: 1, gap: 8 },

  dishRow: { minHeight: DISH_THUMB_SIZE, flexDirection: 'row', alignItems: 'center', gap: 12 },
  dishRowGhost: { opacity: 0.35 },
  dishText: { flex: 1, minWidth: 0, gap: 2 },
  dishTitle: { ...typography.rowTitle, color: palette.ink },
  dishMeta: { ...typography.tileMeta, color: palette.textSecondary },
  quickThumb: { alignItems: 'center', justifyContent: 'center' },
  quickThumbTinted: { backgroundColor: palette.tint },
  quickThumbPlain: { backgroundColor: palette.onImage },

  addDishButton: {
    height: DISH_THUMB_SIZE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.control,
    backgroundColor: palette.background,
  },
  addDishLabel: { ...typography.button, color: palette.actionText },
  addMoreButton: { height: 30, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  addMoreLabel: { ...typography.chip, color: palette.actionText },

  dragPreview: {
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
    height: PREVIEW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    borderRadius: radius.card,
    backgroundColor: palette.popoverSurface,
    shadowColor: palette.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
  },
})
