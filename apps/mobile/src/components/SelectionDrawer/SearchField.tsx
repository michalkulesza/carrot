import { memo, useCallback } from 'react'
import { Pressable, View } from 'react-native'
import { BottomSheetTextInput } from '@gorhom/bottom-sheet'
import { SymbolView } from 'expo-symbols'
import { useTranslation } from 'react-i18next'
import { palette } from '../../theme'
import { styles } from './styles'

interface SearchFieldProps {
  value: string
  onChange: (value: string) => void
  placeholder: string
}

const SearchField = ({ value, onChange, placeholder }: SearchFieldProps) => {
  const { t } = useTranslation()

  const handleClear = useCallback(() => onChange(''), [onChange])

  return (
    <View style={styles.search}>
      <SymbolView name="magnifyingglass" size={18} weight="semibold" tintColor={palette.textTertiary} />
      <BottomSheetTextInput
        style={styles.searchInput}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={palette.placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="default"
        returnKeyType="search"
        textContentType="none"
        accessibilityLabel={placeholder}
      />
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
