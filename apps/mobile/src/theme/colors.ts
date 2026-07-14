import { DynamicColorIOS, Platform, PlatformColor } from 'react-native'

const ios = (name: string, fallback: string): string =>
  (Platform.OS === 'ios' ? PlatformColor(name) : fallback) as unknown as string

// Not a system color, so it needs explicit light/dark values rather than PlatformColor.
const brandText = (Platform.OS === 'ios'
  ? DynamicColorIOS({ light: '#141212', dark: '#F4E7E7' })
  : '#141212') as unknown as string

const orangeGlass = (Platform.OS === 'ios'
  ? DynamicColorIOS({ light: 'rgba(255, 149, 0, 0.72)', dark: 'rgba(255, 159, 10, 0.72)' })
  : 'rgba(255, 149, 0, 0.72)') as unknown as string

export const colors = {
  background: ios('systemBackground', '#ffffff'),
  secondaryBackground: ios('secondarySystemBackground', '#f2f2f7'),
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
  orangeGlass,
  gray: ios('systemGray', '#8e8e93'),
  gray2: ios('systemGray2', '#aeaeb2'),
  gray3: ios('systemGray3', '#c7c7cc'),
  gray4: ios('systemGray4', '#d1d1d6'),
  gray5: ios('systemGray5', '#e5e5ea'),
  gray6: ios('systemGray6', '#f2f2f7'),

  brand: '#ea8e4e',
  brandLight: '#f8e9e3',
  brandText,
}
