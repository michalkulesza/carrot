import { StyleSheet } from 'react-native'
import { colors } from '../../theme/colors'

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  // DraggableFlatList's outer wrapper has no flex by default — without this it
  // sizes to ~half the screen and clips the list. Must be flex: 1 to fill.
  listContainer: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    backgroundColor: colors.background,
  },

  presenceBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
    backgroundColor: colors.background,
  },
  presenceChip: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presenceInitial: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },

  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    paddingVertical: 13,
    paddingHorizontal: 16,
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  itemActive: {
    backgroundColor: colors.secondaryBackground,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  circleBtn: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textArea: {
    flex: 1,
  },
  itemText: {
    fontSize: 16,
    lineHeight: 21,
    color: colors.label,
  },
  completedText: {
    textDecorationLine: 'line-through',
    color: colors.tertiaryLabel,
  },
  lockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  lockDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  lockText: {
    fontSize: 11,
    lineHeight: 13,
    color: colors.secondaryLabel,
  },
  editInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
    color: colors.label,
    padding: 0,
  },
  dragHandle: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  deleteAction: {
    backgroundColor: colors.red,
    justifyContent: 'center',
    alignItems: 'center',
    width: 72,
  },

  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 16,
    backgroundColor: colors.secondaryBackground,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
    minHeight: 52,
  },
  addIconWrap: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  addPlusIcon: {
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '300',
    color: colors.blue,
  },
  addInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
    color: colors.label,
    padding: 0,
  },

  completedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 24,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  completedLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
    color: colors.secondaryLabel,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  clearBtn: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.blue,
  },
})
