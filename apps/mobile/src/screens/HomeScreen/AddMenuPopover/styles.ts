import { StyleSheet } from 'react-native'
import { palette, radius, space } from '../../../theme'

export const CARD_WIDTH = 310
export const CARD_GUTTER = space.lg

export const styles = StyleSheet.create({
  dismiss: { ...StyleSheet.absoluteFill },
  kicker: { fontWeight: '600' },
  card: {
    position: 'absolute',
    right: CARD_GUTTER,
    padding: 6,
    borderRadius: radius.card,
    backgroundColor: palette.popoverSurface,
    transformOrigin: 'top right',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
  },
  clipboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    margin: space.xs,
    padding: space.md,
    borderRadius: radius.control,
    backgroundColor: palette.tint,
  },
  clipboardText: { flex: 1 },
  importButton: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.action,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: 10,
    borderRadius: radius.control,
  },
  rowPressed: { backgroundColor: palette.card },
  rowText: { flex: 1 },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.tint,
  },
  iconTileOnTint: { backgroundColor: palette.popoverSurface },
  tip: {
    marginTop: space.xs,
    marginHorizontal: space.xs,
    marginBottom: 2,
    paddingTop: 10,
    paddingHorizontal: 10,
    paddingBottom: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.dividerCard,
  },
})
