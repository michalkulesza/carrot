import { memo, useMemo } from 'react'
import { StyleProp, Text, TextProps, TextStyle } from 'react-native'
import { palette, PaletteKey, typography, TypographyVariant } from '../../theme'

interface AppTextProps extends TextProps {
  variant?: TypographyVariant
  tone?: PaletteKey
  tabular?: boolean
  style?: StyleProp<TextStyle>
}

const AppText = ({ variant = 'body', tone = 'ink', tabular, style, ...rest }: AppTextProps) => {
  const composedStyle = useMemo(
    () => [typography[variant], { color: palette[tone] }, tabular && typography.tabularNums, style],
    [variant, tone, tabular, style],
  )

  return <Text style={composedStyle} {...rest} />
}

export default memo(AppText)
