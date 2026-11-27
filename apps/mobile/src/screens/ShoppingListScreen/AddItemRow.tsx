import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, TextInput, View } from 'react-native'
import Animated, { useReducedMotion } from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { SymbolView } from 'expo-symbols'
import type { ShoppingCategory } from '@carrot/shared/types'
import { AppText } from '../../components/ui'
import { lightHaptic } from '../../components/ui/haptics'
import { palette, usePressScale } from '../../theme'
import { useResolvedTone } from '../../hooks/useResolvedTone'
import { fieldEntering } from './motion'
import { styles } from './styles'

interface AddItemRowProps {
  category: ShoppingCategory
  open: boolean
  onOpen: (category: ShoppingCategory) => void
  onClose: (category: ShoppingCategory) => void
  onAdd: (category: ShoppingCategory, text: string) => void
}

// Local text state keeps keystrokes from re-rendering the card, which would remount the input and drop focus.
const AddItemRow = ({ category, open, onOpen, onClose, onAdd }: AddItemRowProps) => {
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()
  const { animatedStyle, onPressIn, onPressOut, resetPress } = usePressScale()
  const [text, setText] = useState('')
  const textRef = useRef('')
  const submittingRef = useRef(false)
  const inputRef = useRef<TextInput>(null)

  const actionColor = useResolvedTone('action')
  const addButtonStyle = useMemo(() => [styles.addButton, animatedStyle], [animatedStyle])
  const addCircleStyle = useMemo(() => [styles.addCircle, { borderColor: actionColor }], [actionColor])
  const fieldEnteringAnimation = reduceMotion ? undefined : fieldEntering
  const placeholder = t('shoppingList.addToAisle', { aisle: t(`shoppingList.categories.${category}`) })

  const handleChangeText = useCallback((value: string) => {
    textRef.current = value
    setText(value)
  }, [])

  const handleOpen = useCallback(() => {
    lightHaptic()
    resetPress()
    onOpen(category)
  }, [category, onOpen, resetPress])

  const submit = useCallback(() => {
    const trimmed = textRef.current.trim()
    if (!trimmed || submittingRef.current) return false

    submittingRef.current = true
    requestAnimationFrame(() => { submittingRef.current = false })

    onAdd(category, trimmed)
    textRef.current = ''
    setText('')
    return true
  }, [category, onAdd])

  useEffect(() => {
    if (!open) submit()
  }, [open, submit])

  const handleSubmitPress = useCallback(() => {
    submit()
    inputRef.current?.focus()
  }, [submit])

  const handleBlur = useCallback(() => {
    submit()
    onClose(category)
  }, [category, onClose, submit])

  return (
    <View style={styles.addRow}>
      {open ? (
        <Animated.View style={styles.addFieldWrap} entering={fieldEnteringAnimation}>
          <View style={styles.addField}>
            <TextInput
              ref={inputRef}
              style={styles.addInput}
              value={text}
              onChangeText={handleChangeText}
              onBlur={handleBlur}
              onSubmitEditing={submit}
              placeholder={placeholder}
              placeholderTextColor={palette.placeholder}
              selectionColor={palette.action}
              returnKeyType="done"
              keyboardType="default"
              textContentType="none"
              blurOnSubmit={false}
              autoFocus
              autoCapitalize="sentences"
              autoCorrect
              accessibilityLabel={placeholder}
            />
            <Pressable
              style={styles.submitButton}
              onPress={handleSubmitPress}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel={t('shoppingList.addItem')}
            >
              <SymbolView name="plus" size={18} weight="bold" tintColor={palette.onAction} />
            </Pressable>
          </View>
        </Animated.View>
      ) : (
        <Pressable
          onPress={handleOpen}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          accessibilityRole="button"
          accessibilityLabel={t('shoppingList.addItem')}
        >
          <Animated.View style={addButtonStyle}>
            <View style={addCircleStyle}>
              <SymbolView name="plus" size={12} weight="bold" tintColor={palette.actionText} />
            </View>
            <AppText variant="rowTitle" tone="actionText">{t('shoppingList.addItem')}</AppText>
          </Animated.View>
        </Pressable>
      )}
    </View>
  )
}

export default memo(AddItemRow)
