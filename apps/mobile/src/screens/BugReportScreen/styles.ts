import { StyleSheet } from 'react-native'
import { palette, radius, screenGutter, space, typography } from '../../theme'

const CHECK_CIRCLE_SIZE = 56
const TEXT_AREA_MIN_HEIGHT = 210

export const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: palette.background },
  container: { flex: 1, paddingHorizontal: screenGutter, gap: space.md },
  form: { flex: 1, gap: space.md },
  textArea: {
    minHeight: TEXT_AREA_MIN_HEIGHT,
    paddingHorizontal: space.lg,
    paddingVertical: space.md + 2,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: palette.card,
    color: palette.ink,
    ...typography.bodyLarge,
  },
  thanks: { alignItems: 'center', gap: space.md, paddingTop: space.xxl, paddingHorizontal: space.md },
  checkCircle: {
    width: CHECK_CIRCLE_SIZE,
    height: CHECK_CIRCLE_SIZE,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.tint,
  },
  thanksText: { textAlign: 'center' },
  thanksButton: { paddingTop: space.xs },
})
