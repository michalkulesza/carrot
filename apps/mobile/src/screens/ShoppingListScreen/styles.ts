import { StyleSheet } from 'react-native'
import { palette, radius, screenGutter, space, typography } from '../../theme'

const CARD_GAP = space.md
const ROW_MIN_HEIGHT = 50
const HEADER_MIN_HEIGHT = 48
const ADD_ROW_HEIGHT = 48
const CIRCLE_SIZE = 26
const SUBMIT_SIZE = 36
const DASHED_RING_WIDTH = 1.5
const ROW_PADDING = 6
const STRIKE_THICKNESS = 1.5
const PROGRESS_GAP = 10
const PROGRESS_PADDING_Y = 14
const FIELD_HEIGHT = 44
const FIELD_PADDING_LEFT = 14
const FIELD_PADDING_RIGHT = 6
const EDIT_HEIGHT = 36
const UNDERLINE_HEIGHT = 1.5
const LIFT_SHADOW_OPACITY = 0.12
const LIFT_SHADOW_RADIUS = 8

const CHECKBOX_SLOP_Y = (ROW_MIN_HEIGHT - CIRCLE_SIZE) / 2

export const checkboxHitSlop = { top: CHECKBOX_SLOP_Y, bottom: CHECKBOX_SLOP_Y, left: space.lg, right: space.md / 2 }

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  headerTitle: { width: '100%', justifyContent: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: palette.background },
  flex: { flex: 1 },
  clip: { overflow: 'hidden' },
  // Zero insets are inert while in flow and pin the full width once the body is lifted out of flow.
  body: { top: 0, left: 0, right: 0 },

  presenceBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: screenGutter,
    paddingBottom: space.md,
  },
  presenceChip: {
    width: 28,
    height: 28,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presenceInitial: { ...typography.badge, color: palette.onImage },

  progressCard: {
    marginHorizontal: screenGutter,
    paddingVertical: PROGRESS_PADDING_Y,
    paddingHorizontal: space.lg,
    gap: PROGRESS_GAP,
    borderRadius: radius.card,
    backgroundColor: palette.card,
  },
  progressRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  clearButton: { height: 32, justifyContent: 'center' },

  card: {
    marginHorizontal: screenGutter,
    marginTop: CARD_GAP,
    borderRadius: radius.card,
    backgroundColor: palette.card,
    overflow: 'hidden',
  },
  header: { paddingTop: space.xs, paddingHorizontal: space.lg },
  headerRow: {
    minHeight: HEADER_MIN_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  headerDivider: { height: 1, backgroundColor: palette.dividerCard },
  rowSurface: { paddingHorizontal: space.lg, backgroundColor: palette.card },
  liftedRow: {
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: palette.card,
    paddingHorizontal: space.lg,
    justifyContent: 'center',
    shadowColor: palette.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: LIFT_SHADOW_OPACITY,
    shadowRadius: LIFT_SHADOW_RADIUS,
  },
  liftedRowContent: { flexDirection: 'row', alignItems: 'center', gap: space.md },

  itemRow: {
    minHeight: ROW_MIN_HEIGHT,
    paddingVertical: ROW_PADDING,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.dividerCard,
  },
  textArea: { flex: 1, justifyContent: 'center' },
  strikeLayer: { ...StyleSheet.absoluteFill },
  strikeLine: { position: 'absolute', height: STRIKE_THICKNESS, marginTop: -STRIKE_THICKNESS / 2, backgroundColor: palette.ink },
  lockBadge: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  lockDot: { width: 6, height: 6, borderRadius: 3 },
  editWrap: { minHeight: EDIT_HEIGHT, justifyContent: 'center' },
  editInput: { ...typography.bodyLarge, color: palette.ink, padding: 0 },
  editUnderline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: UNDERLINE_HEIGHT,
    backgroundColor: palette.action,
  },
  deleteAction: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.error,
  },

  addRow: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  addButton: {
    height: ADD_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  addCircle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    borderWidth: DASHED_RING_WIDTH,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addFieldWrap: { paddingTop: ADD_ROW_HEIGHT - FIELD_HEIGHT },
  addField: {
    height: FIELD_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingLeft: FIELD_PADDING_LEFT,
    paddingRight: FIELD_PADDING_RIGHT,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: palette.dividerCard,
    backgroundColor: palette.background,
  },
  addInput: { ...typography.body, flex: 1, color: palette.ink, padding: 0 },
  submitButton: {
    width: SUBMIT_SIZE,
    height: SUBMIT_SIZE,
    borderRadius: radius.input,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.action,
  },
})
