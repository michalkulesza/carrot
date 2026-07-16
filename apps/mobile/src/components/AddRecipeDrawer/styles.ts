import { PlatformColor, StyleSheet } from 'react-native'
import { colors } from '../../theme/colors'

export const styles = StyleSheet.create({
  sheetBackground: { backgroundColor: PlatformColor('secondarySystemBackground') as unknown as string },
  sheetHandle: { backgroundColor: PlatformColor('systemGray3') as unknown as string },
  container: { paddingBottom: 16 },

  subviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  subviewBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: -8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  subviewBackText: {
    fontSize: 17,
    color: PlatformColor('systemBlue') as unknown as string,
    marginLeft: -2,
  },
  subviewTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    marginRight: 40,
    color: PlatformColor('label') as unknown as string,
  },

  // Quick URL input
  quickUrlSection: { paddingTop: 8, paddingHorizontal: 16, gap: 10 },

  // Method picker
  pickerWrap: { paddingTop: 16, paddingHorizontal: 16, gap: 12 },
  pickerGroup: {
    backgroundColor: PlatformColor('systemBackground') as unknown as string,
    borderRadius: 16,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
    backgroundColor: PlatformColor('systemBackground') as unknown as string,
    minHeight: 64,
  },
  methodRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PlatformColor('separator') as unknown as string,
  },
  methodRowPressed: {
    backgroundColor: PlatformColor('systemFill') as unknown as string,
  },
  methodIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 9,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PlatformColor('systemGray5') as unknown as string,
  },
  methodTextWrap: { flex: 1 },
  methodTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: PlatformColor('label') as unknown as string,
    marginBottom: 1,
  },
  methodDesc: {
    fontSize: 13,
    color: PlatformColor('secondaryLabel') as unknown as string,
    lineHeight: 17,
  },

  inputSection: { padding: 16, gap: 12 },

  // URL input
  urlInputGroup: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  urlInput: {
    flex: 1,
    height: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PlatformColor('opaqueSeparator') as unknown as string,
    borderRadius: 999,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: PlatformColor('secondarySystemBackground') as unknown as string,
    color: PlatformColor('label') as unknown as string,
  },
  pasteIconBtn: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PlatformColor('opaqueSeparator') as unknown as string,
    backgroundColor: PlatformColor('secondarySystemBackground') as unknown as string,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pasteIconBtnText: {
    fontSize: 16,
    color: PlatformColor('secondaryLabel') as unknown as string,
    fontWeight: '500',
  },

  // Text paste input
  textInputGroup: { gap: 8 },
  textPasteInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PlatformColor('opaqueSeparator') as unknown as string,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: 16,
    backgroundColor: PlatformColor('secondarySystemBackground') as unknown as string,
    color: PlatformColor('label') as unknown as string,
    minHeight: 160,
    maxHeight: 240,
    textAlignVertical: 'top',
  },
  textPasteInlineBtn: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: PlatformColor('systemBackground') as unknown as string,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PlatformColor('opaqueSeparator') as unknown as string,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  textPasteBtnText: {
    fontSize: 16,
    color: PlatformColor('systemBlue') as unknown as string,
    fontWeight: '500',
  },

  // Share tip card
  shareTipCard: {
    backgroundColor: PlatformColor('systemBackground') as unknown as string,
    borderRadius: 16,
    borderCurve: 'continuous',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  shareTipText: {
    fontSize: 13,
    color: PlatformColor('secondaryLabel') as unknown as string,
    lineHeight: 19,
  },

  // Personal library picker
  personalRecipePicker: { flex: 1, paddingHorizontal: 16, gap: 12 },
  personalRecipeListWrap: { flex: 1 },
  personalRecipeLoading: { paddingVertical: 40 },
  personalRecipeSearch: {
    height: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PlatformColor('opaqueSeparator') as unknown as string,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    backgroundColor: PlatformColor('systemBackground') as unknown as string,
    color: PlatformColor('label') as unknown as string,
  },
  personalRecipeRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  personalRecipeRowPressed: { opacity: 0.55 },
  personalRecipeThumbnail: {
    width: 48,
    height: 48,
    borderRadius: 8,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: PlatformColor('systemGray5') as unknown as string,
  },
  personalRecipeTitle: {
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
    color: PlatformColor('label') as unknown as string,
  },
  personalRecipeAdd: {
    fontSize: 16,
    color: PlatformColor('systemBlue') as unknown as string,
    fontWeight: '600',
  },
  personalRecipeSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: PlatformColor('separator') as unknown as string,
    marginLeft: 60,
  },
  personalRecipeEmpty: {
    paddingVertical: 32,
    textAlign: 'center',
    fontSize: 16,
    color: PlatformColor('secondaryLabel') as unknown as string,
  },

  // Error box
  errorBox: {
    marginHorizontal: 16,
    marginTop: 4,
    backgroundColor: colors.brandLight,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.brand,
  },
  errorTitle: { fontSize: 13, fontWeight: '700', color: colors.brand, marginBottom: 4 },
  errorMsg: { fontSize: 13, color: colors.brand, lineHeight: 18, opacity: 0.8 },
  openInBrowserBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.brand,
  },
  openInBrowserText: { fontSize: 13, fontWeight: '600', color: colors.background },
})
