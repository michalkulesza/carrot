import { memo, useMemo } from 'react'
import { TextInput, type TextInputProps } from 'react-native'
import { palette } from '../../theme'
import { styles } from './styles'

const EditTextInput = ({ style, ...rest }: TextInputProps) => {
  const inputStyle = useMemo(() => [styles.editInput, style], [style])

  return (
    <TextInput
      placeholderTextColor={palette.placeholder}
      selectionColor={palette.action}
      {...rest}
      style={inputStyle}
    />
  )
}

export default memo(EditTextInput)
