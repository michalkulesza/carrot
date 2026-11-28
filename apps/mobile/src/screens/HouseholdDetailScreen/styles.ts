import { Platform, StyleSheet } from 'react-native'
import { palette, radius, screenGutter, space, typography } from '../../theme'

const SWATCH_SIZE = 40
const RING_INSET = 4
const FIELD_MIN_HEIGHT = 44
const CODE_FONT_FAMILY = Platform.select({ ios: 'Menlo', default: 'monospace' })

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: space.xl },
  identity: { alignItems: 'center', gap: space.sm + 2, paddingHorizontal: screenGutter },
  nameButton: { alignItems: 'center', paddingVertical: space.xs },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.sm + 2, paddingTop: space.xs },
  swatchSlot: { width: SWATCH_SIZE, height: SWATCH_SIZE },
  swatch: { width: SWATCH_SIZE, height: SWATCH_SIZE, borderRadius: radius.round },
  swatchRing: {
    position: 'absolute',
    top: -RING_INSET,
    left: -RING_INSET,
    right: -RING_INSET,
    bottom: -RING_INSET,
    borderRadius: radius.round,
    borderWidth: 2,
  },
  inviteCard: {
    marginHorizontal: screenGutter,
    marginTop: space.xl,
    padding: space.lg,
    gap: space.md,
    borderRadius: radius.card,
    backgroundColor: palette.todayCard,
    overflow: 'hidden',
  },
  inviteRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  field: {
    flex: 1,
    minHeight: FIELD_MIN_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: space.md + 2,
    borderRadius: radius.control,
    backgroundColor: palette.background,
  },
  codeText: { fontSize: 20, lineHeight: 25, fontWeight: '700', letterSpacing: 3, fontFamily: CODE_FONT_FAMILY, fontVariant: ['tabular-nums'], color: palette.ink },
  emailInput: { flex: 1, minHeight: FIELD_MIN_HEIGHT, paddingVertical: space.sm, ...typography.body, color: palette.ink },
  inviteMessage: { paddingHorizontal: space.xs },
})
