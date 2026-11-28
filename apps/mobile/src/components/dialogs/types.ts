import type { TextInputProps } from 'react-native'

export interface PromptOptions {
  title: string
  message?: string
  placeholder?: string
  defaultValue?: string
  confirmLabel?: string
  destructive?: boolean
  keyboardType?: TextInputProps['keyboardType']
  autoCapitalize?: TextInputProps['autoCapitalize']
  textContentType?: TextInputProps['textContentType']
}

export interface ActionMenuOption {
  label: string
  destructive?: boolean
  selected?: boolean
  onPress: () => void
}

export interface ActionMenuOptions {
  title?: string
  message?: string
  options: ActionMenuOption[]
}

export type PromptFn = (options: PromptOptions) => Promise<string | null>
export type ShowActionMenuFn = (options: ActionMenuOptions) => void
