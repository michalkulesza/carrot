import { DynamicColorIOS, Platform, PlatformColor } from 'react-native'

const ios = (name: string, fallback: string): string =>
  (Platform.OS === 'ios' ? PlatformColor(name) : fallback) as unknown as string

// Not a system color, so it needs explicit light/dark values rather than PlatformColor.
const brandText = (Platform.OS === 'ios'
  ? DynamicColorIOS({ light: '#141212', dark: '#F4E7E7' })
  : '#141212') as unknown as string

const secondaryBackgroundTransparent = (Platform.OS === 'ios'
  ? DynamicColorIOS({ light: 'rgba(242, 242, 247, 0)', dark: 'rgba(28, 28, 30, 0)' })
  : 'rgba(242, 242, 247, 0)') as unknown as string

export const colors = {
  background: ios('systemBackground', '#ffffff'),
  secondaryBackground: ios('secondarySystemBackground', '#f2f2f7'),
  secondaryBackgroundTransparent,
  tertiaryBackground: ios('tertiarySystemBackground', '#ffffff'),

  label: ios('label', '#000000'),
  secondaryLabel: ios('secondaryLabel', '#3c3c43'),
  tertiaryLabel: ios('tertiaryLabel', '#3c3c4399'),
  placeholderText: ios('placeholderText', '#3c3c4366'),

  separator: ios('separator', '#3c3c4349'),
  opaqueSeparator: ios('opaqueSeparator', '#c6c6c8'),

  systemFill: ios('systemFill', '#78788033'),
  secondarySystemFill: ios('secondarySystemFill', '#78788028'),
  tertiarySystemFill: ios('tertiarySystemFill', '#7676801e'),

  blue: ios('systemBlue', '#007aff'),
  red: ios('systemRed', '#ff3b30'),
  green: ios('systemGreen', '#34c759'),
  orange: ios('systemOrange', '#ff9500'),
  gray: ios('systemGray', '#8e8e93'),
  gray2: ios('systemGray2', '#aeaeb2'),
  gray3: ios('systemGray3', '#c7c7cc'),
  gray4: ios('systemGray4', '#d1d1d6'),
  gray5: ios('systemGray5', '#e5e5ea'),
  gray6: ios('systemGray6', '#f2f2f7'),

  brand: '#ea8e4e',
  brandLight: (Platform.OS === 'ios'
    ? DynamicColorIOS({ light: '#f8e9e3', dark: '#4a2e23' })
    : '#f8e9e3') as unknown as string,
  brandText,
}

const dynamic = (light: string, dark: string): string =>
  (Platform.OS === 'ios' ? DynamicColorIOS({ light, dark }) : light) as unknown as string

export const paletteTones = {
  ink: ['#1C1C1E', '#F3EEE6'],
  textSecondary: ['#6B625B', '#B8AEA3'],
  textTertiary: ['#7D746D', '#A39A90'],
  placeholder: ['#A39A92', '#7D746D'],
  bodyOnCard: ['#3A332E', '#DDD5CA'],
  background: ['#FFFFFF', '#14110E'],
  card: ['#F7F5F2', '#26211C'],
  control: ['#EFEBE6', '#332C26'],
  dividerCard: ['#E6DFD6', '#E6DFD6'],
  track: ['#E8E2DB', '#3A332C'],
  dividerStrong: ['#D6CEC5', '#4A4037'],
  outlineSubtle: ['#E2DDD6', '#3A322B'],
  ring: ['#CFC7BE', '#4A4037'],
  checkboxRing: ['#3A332E', '#DDD5CA'],
  action: ['#CF6528', '#E8894A'],
  actionDisabled: ['#E8C4AA', '#5A3A24'],
  actionText: ['#A9521D', '#F0A06A'],
  tint: ['#FCEBDD', '#3A2618'],
  todayCard: ['#FFF4EA', '#2E2016'],
  anchorLine: ['#F3C9AC', '#6B4326'],
  tintText: ['#7E3C14', '#F5B98C'],
  note: ['#FCEBDD', '#3A2618'],
  noteText: ['#7E3C14', '#F5B98C'],
  allergen: ['#FFF2D1', '#3A2E14'],
  allergenText: ['#7A4E00', '#F2C66B'],
  error: ['#B3261E', '#F2877F'],
  errorBg: ['#FBE4E1', '#3F1F1C'],
  success: ['#1F7A3A', '#6FD08A'],
  successBg: ['#E3F5E7', '#1C3023'],
  successCheck: ['#34A853', '#4CBF6A'],
  avatarHousehold: ['#E0439A', '#E0439A'],
  onAction: ['#FFFFFF', '#1A0F08'],
  popoverSurface: ['#FFFFFF', '#26211C'],
  glassFill: ['rgba(255,255,255,0.82)', 'rgba(38,33,28,0.82)'],
  glassTint: ['rgba(60,45,30,0.07)', 'rgba(0,0,0,0.15)'],
  shadowSoft: ['rgba(40,30,20,0.12)', 'rgba(0,0,0,0.4)'],
} satisfies Record<string, readonly [string, string]>

type ToneKey = keyof typeof paletteTones

const dynamicTones = Object.fromEntries(
  Object.entries(paletteTones).map(([key, [light, dark]]) => [key, dynamic(light, dark)]),
) as Record<ToneKey, string>

export const palette = {
  ...dynamicTones,
  onImage: '#FFFFFF',
  onImageText: '#1C1C1E',
  backdrop: 'rgba(20,15,10,0.32)',
}

export type PaletteKey = keyof typeof palette

export const withAlpha = (hex: string, alpha: number) => {
  const value = parseInt(hex.slice(1), 16)

  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`
}
