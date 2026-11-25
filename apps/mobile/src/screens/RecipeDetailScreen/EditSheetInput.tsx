import { memo, useCallback, useMemo, useState } from 'react'
import type { BlurEvent, FocusEvent } from 'react-native'
import { BottomSheetTextInput } from '@gorhom/bottom-sheet'
import type { ComponentProps } from 'react'
import { palette } from '../../theme'
import { styles } from './styles'

const EditSheetInput = ({ style, onFocus, onBlur, ...rest }: ComponentProps<typeof BottomSheetTextInput>) => {
  const [focused, setFocused] = useState(false)

  const inputStyle = useMemo(() => [styles.editSheetInput, style, focused && styles.editSheetInputFocused], [style, focused])

  const handleFocus = useCallback(
    (event: FocusEvent) => {
      setFocused(true)
      onFocus?.(event)
    },
    [onFocus],
  )

  const handleBlur = useCallback(
    (event: BlurEvent) => {
      setFocused(false)
      onBlur?.(event)
    },
    [onBlur],
  )

  return (
    <BottomSheetTextInput
      placeholderTextColor={palette.placeholder}
      {...rest}
      style={inputStyle}
      onFocus={handleFocus}
      onBlur={handleBlur}
    />
  )
}

export default memo(EditSheetInput)
