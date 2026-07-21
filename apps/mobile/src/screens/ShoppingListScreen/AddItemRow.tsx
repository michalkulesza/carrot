import { useCallback, useRef, useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'
import { colors } from '../../theme/colors'
import { styles } from './styles'

// Keeps its text in local state so typing never re-renders the parent list —
// otherwise the FlatList footer remounts on each keystroke and the input loses focus.
const AddItemRow = ({
  onAdd,
  onFocusInput,
  onBlurInput,
}: {
  onAdd: (text: string) => void
  onFocusInput: () => void
  onBlurInput: () => void
}) => {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const inputRef = useRef<TextInput>(null)

  const submit = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed) return
    onAdd(trimmed)
    setText('')
    // Keep the keyboard up for rapid entry of multiple items.
    setTimeout(() => inputRef.current?.focus(), 50)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }, [text, onAdd])

  const handleFocus = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onFocusInput()
  }, [onFocusInput])

  return (
    <Pressable style={styles.addRow} onPress={() => inputRef.current?.focus()}>
      <View style={styles.addIconWrap}>
        <Text style={styles.addPlusIcon}>+</Text>
      </View>
      <TextInput
        ref={inputRef}
        style={styles.addInput}
        value={text}
        onChangeText={setText}
        onFocus={handleFocus}
        onBlur={onBlurInput}
        placeholder={t('shoppingList.addItemPlaceholder')}
        placeholderTextColor={colors.placeholderText}
        returnKeyType="done"
        onSubmitEditing={submit}
        blurOnSubmit={false}
        autoCapitalize="sentences"
        autoCorrect
      />
    </Pressable>
  )
}

export default AddItemRow
