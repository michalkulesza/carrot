import { StyleSheet } from 'react-native'

const em = (size: number, value: number) => Math.round(size * value * 100) / 100

export const typography = StyleSheet.create({
  screenTitle: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: em(22, -0.01) },
  recipeTitle: { fontSize: 28, lineHeight: 31, fontWeight: '700', letterSpacing: em(28, -0.02) },
  sectionHeading: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: em(22, -0.01) },
  groupTitle: { fontSize: 18, lineHeight: 23, fontWeight: '700', letterSpacing: em(18, -0.01) },
  bodyLarge: { fontSize: 17, lineHeight: 23, fontWeight: '400' },
  body: { fontSize: 16, lineHeight: 21, fontWeight: '400' },
  meta: { fontSize: 14, lineHeight: 19, fontWeight: '400' },
  caption: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: em(13, 0.04),
  },
  kicker: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: em(13, 0.08),
  },
  heroTitle: { fontSize: 19, lineHeight: 23, fontWeight: '700', letterSpacing: em(19, -0.01) },
  cardTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  rowTitle: { fontSize: 16, lineHeight: 21, fontWeight: '600' },
  tileTitle: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  pillSmall: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  pillMedium: { fontSize: 14, lineHeight: 19, fontWeight: '500' },
  tileMeta: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  button: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  buttonLarge: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  badge: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  cookTitle: { fontSize: 32, lineHeight: 35, fontWeight: '700', letterSpacing: em(32, -0.02) },
  cookBody: { fontSize: 23, lineHeight: 32, fontWeight: '400' },
  timerValue: { fontSize: 22, lineHeight: 26, fontWeight: '700' },
  microBadge: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: em(11, 0.06) },
  tabularNums: { fontVariant: ['tabular-nums'] },
})

export type TypographyVariant = Exclude<keyof typeof typography, 'tabularNums'>
