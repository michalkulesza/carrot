import { DynamicColorIOS, Platform, PlatformColor } from 'react-native'

const ios = (name: string, fallback: string): string =>
  (Platform.OS === 'ios' ? PlatformColor(name) : fallback) as unknown as string

export const colors = {
  // Backgrounds
  background: ios('systemBackground', '#ffffff'),
  secondaryBackground: ios('secondarySystemBackground', '#f2f2f7'),
  tertiaryBackground: ios('tertiarySystemBackground', '#ffffff'),

  // Labels / text
  label: ios('label', '#000000'),
  secondaryLabel: ios('secondaryLabel', '#3c3c43'),
  tertiaryLabel: ios('tertiaryLabel', '#3c3c4399'),
  placeholderText: ios('placeholderText', '#3c3c4366'),

  // Separators / borders
  separator: ios('separator', '#3c3c4349'),
  opaqueSeparator: ios('opaqueSeparator', '#c6c6c8'),

  // System fills (for input backgrounds, cards)
  systemFill: ios('systemFill', '#78788033'),
  secondarySystemFill: ios('secondarySystemFill', '#78788028'),
  tertiarySystemFill: ios('tertiarySystemFill', '#7676801e'),

  // System colors
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

  // Brand (non-system, kept as-is)
  brand: '#cb6134',
  brandLight: '#f8e9e3',
  brandText: (Platform.OS === 'ios'
    ? DynamicColorIOS({ light: '#141212', dark: '#F4E7E7' })
    : '#141212') as unknown as string,
}
