import { useCallback, useMemo, useState } from 'react'
import type { TextInputProps } from 'react-native'
import { BottomSheetTextInput } from '@gorhom/bottom-sheet'
import { useResolvedColorScheme } from '../../context/ColorSchemeContext'
import { palette, paletteTones, radius } from '../../theme'
import { styles } from './styles'

interface SheetInputProps extends TextInputProps {
  variant: 'field' | 'area'
}

const SheetInput = ({ variant, style, onFocus, onBlur, ...rest }: SheetInputProps) => {
  const [focused, setFocused] = useState(false)
  const isArea = variant === 'area'
  const toneIndex = useResolvedColorScheme() === 'dark' ? 1 : 0
  const borderRadius = isArea ? radius.card : radius.control
  const restingBorder = isArea ? 'transparent' : paletteTones.dividerCard[toneIndex]
  // TextInput renders DynamicColorIOS borders black, so borders use the resolved hex.
  const borderColor = focused ? paletteTones.action[toneIndex] : restingBorder

  const handleFocus = useCallback<NonNullable<TextInputProps['onFocus']>>(
    (event) => {
      setFocused(true)
      onFocus?.(event)
    },
    [onFocus],
  )

  const handleBlur = useCallback<NonNullable<TextInputProps['onBlur']>>(
    (event) => {
      setFocused(false)
      onBlur?.(event)
    },
    [onBlur],
  )

  const inputStyle = useMemo(
    () => [
      isArea ? styles.areaInput : styles.fieldInput,
      { borderRadius, borderColor },
      focused && isArea && styles.areaInputFocused,
      style,
    ],
    [isArea, borderRadius, borderColor, focused, style],
  )

  return (
    <BottomSheetTextInput
      {...rest}
      style={inputStyle}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholderTextColor={palette.placeholder}
      multiline={isArea}
      numberOfLines={isArea ? undefined : 1}
    />
  )
}

export default SheetInput
