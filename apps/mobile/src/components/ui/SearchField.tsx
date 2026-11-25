import { memo, useCallback, type Ref } from 'react'
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native'
import { BottomSheetTextInput } from '@gorhom/bottom-sheet'
import { SymbolView } from 'expo-symbols'
import { useTranslation } from 'react-i18next'
import { palette, radius, typography } from '../../theme'

interface SearchFieldProps {
  value: string
  onChange: (value: string) => void
  placeholder: string
  inSheet?: boolean
  inputRef?: Ref<TextInput>
}

const SearchField = ({ value, onChange, placeholder, inSheet = false, inputRef }: SearchFieldProps) => {
  const { t } = useTranslation()

  const handleClear = useCallback(() => onChange(''), [onChange])

  const inputProps = {
    style: styles.input,
    value,
    onChangeText: onChange,
    placeholder,
    placeholderTextColor: palette.placeholder,
    autoCapitalize: 'none',
    autoCorrect: false,
    keyboardType: 'default',
    returnKeyType: 'search',
    textContentType: 'none',
    accessibilityLabel: placeholder,
  } satisfies TextInputProps

  return (
    <View style={styles.search}>
      <SymbolView name="magnifyingglass" size={18} weight="semibold" tintColor={palette.textTertiary} />
      {/* Inside a bottom sheet the input must be BottomSheetTextInput so the sheet tracks the keyboard. */}
      {inSheet ? <BottomSheetTextInput {...inputProps} /> : <TextInput ref={inputRef} {...inputProps} />}
      {value ? (
        <Pressable
          style={styles.clearButton}
          onPress={handleClear}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('selectionDrawer.clearSearch')}
        >
          <SymbolView name="xmark" size={10} weight="bold" tintColor={palette.onImage} />
        </Pressable>
      ) : null}
    </View>
  )
}

export default memo(SearchField)

const styles = StyleSheet.create({
  search: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: radius.control,
    backgroundColor: palette.control,
  },
  input: { flex: 1, paddingVertical: 0, ...typography.body, color: palette.ink },
  clearButton: {
    width: 22,
    height: 22,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.placeholder,
  },
})
