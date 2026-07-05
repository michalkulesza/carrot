import { forwardRef, useCallback, useImperativeHandle, useState } from 'react'
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'
import { colors } from '../theme/colors'

export interface AddIngredientToShoppingListSheetHandle {
  present: (initialText: string) => void
  dismiss: () => void
}

interface AddIngredientToShoppingListSheetProps {
  onConfirm: (text: string) => void
}

// Centered iOS alert-style popup that lets the user review/edit an
// ingredient's text before it is added to the shopping list.
const AddIngredientToShoppingListSheet = forwardRef<
  AddIngredientToShoppingListSheetHandle,
  AddIngredientToShoppingListSheetProps
>(({ onConfirm }, ref) => {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)
  const [text, setText] = useState('')

  useImperativeHandle(ref, () => ({
    present: (initialText: string) => {
      setText(initialText)
      setVisible(true)
    },
    dismiss: () => setVisible(false),
  }))

  const handleCancel = useCallback(() => {
    setVisible(false)
  }, [])

  const handleAdd = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed) return
    onConfirm(trimmed)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    setVisible(false)
  }, [text, onConfirm])

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleCancel} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.avoidingView}
        >
          <View style={styles.card}>
            <View style={styles.body}>
              <Text style={styles.title}>{t('shoppingList.addToList')}</Text>
              <TextInput
                style={styles.input}
                value={text}
                onChangeText={setText}
                placeholder={t('shoppingList.addItemPlaceholder')}
                placeholderTextColor={colors.placeholderText}
                autoFocus
                autoCapitalize="sentences"
                autoCorrect
                multiline
                textAlignVertical="top"
                returnKeyType="done"
              />
            </View>
            <View style={styles.buttonRow}>
              <Pressable
                onPress={handleCancel}
                style={({ pressed }) => [styles.button, styles.buttonLeft, pressed && styles.buttonPressed]}
                accessibilityLabel={t('common.cancel')}
                accessibilityRole="button"
              >
                <Text style={styles.cancelText}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                onPress={handleAdd}
                disabled={!text.trim()}
                style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
                accessibilityLabel={t('common.add')}
                accessibilityRole="button"
              >
                <Text style={[styles.addText, !text.trim() && styles.addTextDisabled]}>
                  {t('common.add')}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
})

AddIngredientToShoppingListSheet.displayName = 'AddIngredientToShoppingListSheet'

export default AddIngredientToShoppingListSheet

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avoidingView: {
    width: '100%',
    alignItems: 'center',
  },
  card: {
    width: 320,
    borderRadius: 14,
    backgroundColor: colors.tertiaryBackground,
    overflow: 'hidden',
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    gap: 16,
  },
  title: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
    color: colors.label,
    textAlign: 'center',
  },
  input: {
    minHeight: 44,
    backgroundColor: colors.secondarySystemFill,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 17,
    lineHeight: 22,
    color: colors.label,
  },
  buttonRow: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  button: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLeft: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.separator,
  },
  buttonPressed: {
    backgroundColor: colors.secondarySystemFill,
  },
  cancelText: {
    fontSize: 17,
    lineHeight: 22,
    color: colors.blue,
  },
  addText: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
    color: colors.blue,
  },
  addTextDisabled: {
    color: colors.gray3,
  },
})
