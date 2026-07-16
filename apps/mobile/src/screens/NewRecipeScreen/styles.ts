import { PlatformColor, StyleSheet } from 'react-native'
import { colors } from '../../theme/colors'

export const styles = StyleSheet.create({
  flex: { flex: 1 },
  screenBackground: { backgroundColor: colors.background },
  scrollContent: { paddingBottom: 120 },

  // Header back button
  headerBackBtnWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: -8,
    paddingHorizontal: 4,
  },
  headerBackChevron: { marginRight: -4 },
  headerBackBtn: {
    fontSize: 17,
    color: PlatformColor('label') as unknown as string,
  },

  // Error box
  errorBox: {
    margin: 16,
    backgroundColor: colors.brandLight,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.brand,
  },
  errorTitle: { fontSize: 13, fontWeight: '700', color: colors.brand, marginBottom: 4 },
  errorMsg: { fontSize: 13, color: colors.brand, lineHeight: 18, opacity: 0.8 },

  // Action bar
  actionBar: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: PlatformColor('separator') as unknown as string,
    backgroundColor: PlatformColor('systemBackground') as unknown as string,
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: PlatformColor('opaqueSeparator') as unknown as string,
    borderRadius: 999,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { fontSize: 16, color: PlatformColor('secondaryLabel') as unknown as string, fontWeight: '500' },

  // Read-only import preview (mirrors saved-recipe detail screen)
  previewHeroImage: { width: '100%', aspectRatio: 4 / 3 },
  previewCard: { backgroundColor: colors.background, paddingHorizontal: 16, paddingTop: 20 },
  previewTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: PlatformColor('label') as unknown as string,
    marginBottom: 10,
    lineHeight: 34,
  },
  previewTagRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12, gap: 6 },
  previewTag: {
    backgroundColor: colors.brandLight,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  previewTagText: { color: colors.brand, fontSize: 12, fontWeight: '500' },
  previewSourceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  previewSourceText: { fontSize: 13, color: PlatformColor('secondaryLabel') as unknown as string },
  previewComponentBlock: { marginTop: 8 },
  previewComponentName: {
    fontSize: 20,
    fontWeight: '600',
    color: PlatformColor('label') as unknown as string,
    marginBottom: 12,
    lineHeight: 25,
  },
  previewSection: { marginBottom: 16 },
  previewSectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: PlatformColor('secondaryLabel') as unknown as string,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  previewIngredientRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  previewBullet: { color: PlatformColor('tertiaryLabel') as unknown as string, marginRight: 8, marginTop: 1 },
  previewIngredientText: {
    flex: 1,
    fontSize: 17,
    color: PlatformColor('label') as unknown as string,
    lineHeight: 22,
  },
  previewStepRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  previewStepNum: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.blue,
    width: 28,
    marginTop: 1,
  },
  previewStepText: {
    flex: 1,
    fontSize: 17,
    color: PlatformColor('label') as unknown as string,
    lineHeight: 22,
  },

  // Edit-mode variants of the preview above (same layout, editable fields)
  previewHeroPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: PlatformColor('secondarySystemBackground') as unknown as string,
  },
  previewHeroPlaceholderText: { fontSize: 13, color: PlatformColor('secondaryLabel') as unknown as string },
  previewHeroEditBtn: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  previewHeroEditText: { fontSize: 12, color: '#ffffff', fontWeight: '600' },
  previewTitleInput: {
    borderBottomWidth: 1,
    borderColor: PlatformColor('opaqueSeparator') as unknown as string,
    paddingBottom: 4,
  },
  previewAddTagBtn: {
    borderWidth: 1,
    borderColor: PlatformColor('opaqueSeparator') as unknown as string,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  previewAddTagText: { fontSize: 12, color: PlatformColor('secondaryLabel') as unknown as string },
  previewStepEditRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 8 },
  previewStepInput: {
    flex: 1,
    fontSize: 17,
    color: PlatformColor('label') as unknown as string,
    lineHeight: 22,
    borderBottomWidth: 1,
    borderColor: PlatformColor('opaqueSeparator') as unknown as string,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },

  // Add row buttons
  addRowBtn: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignSelf: 'flex-start',
  },
  addRowBtnText: {
    fontSize: 16,
    color: colors.brand,
    fontWeight: '500',
  },

  stepRemoveBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: PlatformColor('systemRed') as unknown as string,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 3,
  },
  stepRemoveText: { fontSize: 16, color: '#fff', fontWeight: '600', lineHeight: 20 },
})
