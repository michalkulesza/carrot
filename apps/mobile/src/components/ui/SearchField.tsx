import { memo, useCallback } from 'react'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'
import { SymbolView } from 'expo-symbols'
import { useTranslation } from 'react-i18next'
import { palette, radius, space, typography } from '../../theme'

interface SearchFieldProps {
  value: string
  onChangeText: (value: string) => void
  placeholder: string
}

const FIELD_MIN_HEIGHT = 44
const CLEAR_SIZE = 18

const SearchField = ({ value, onChangeText, placeholder }: SearchFieldProps) => {
  const { t } = useTranslation()

  const handleClear = useCallback(() => onChangeText(''), [onChangeText])

  return (
    <View style={styles.field}>
      <SymbolView name="magnifyingglass" size={18} weight="semibold" tintColor={palette.textTertiary} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        accessibilityRole="search"
        textContentType="none"
        accessibilityLabel={placeholder}
      />
      {value ? (
        <Pressable
          style={styles.clear}
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

const styles = StyleSheet.create({
  field: {
    minHeight: FIELD_MIN_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.control,
    backgroundColor: palette.control,
  },
  input: { flex: 1, paddingVertical: 0, ...typography.body, color: palette.ink },
  clear: {
    width: CLEAR_SIZE,
    height: CLEAR_SIZE,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.textTertiary,
  },
})

export default memo(SearchField)
