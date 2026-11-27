import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { TextInput, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { palette } from '../../theme'
import { FOCUS_UNDERLINE_MS } from './motion'
import { styles } from './styles'

interface ItemTextEditorProps {
  id: string
  initialText: string
  accessibilityLabel: string
  onEnd: (id: string, initialText: string, nextText: string) => void
}

const ItemTextEditor = ({ id, initialText, accessibilityLabel, onEnd }: ItemTextEditorProps) => {
  const [value, setValue] = useState(initialText)
  const endedRef = useRef(false)
  const focus = useSharedValue(0)

  const underlineStyle = useAnimatedStyle(() => ({ opacity: focus.value }))

  const handleFocus = useCallback(() => {
    focus.value = withTiming(1, { duration: FOCUS_UNDERLINE_MS })
  }, [focus])

  const commit = useCallback(() => {
    if (endedRef.current) return

    endedRef.current = true
    onEnd(id, initialText, value)
  }, [id, initialText, onEnd, value])

  const handleEnd = useCallback(() => {
    focus.value = withTiming(0, { duration: FOCUS_UNDERLINE_MS })
    commit()
  }, [focus, commit])

  const commitRef = useRef(commit)
  commitRef.current = commit

  // Unmounting while focused (row removed, editor swapped) may skip onBlur; commit so text and the edit lock are never lost.
  useEffect(() => () => commitRef.current(), [])

  return (
    <View style={styles.editWrap}>
      <TextInput
        style={styles.editInput}
        value={value}
        onChangeText={setValue}
        onFocus={handleFocus}
        onSubmitEditing={handleEnd}
        onBlur={handleEnd}
        selectionColor={palette.action}
        returnKeyType="done"
        multiline
        scrollEnabled={false}
        submitBehavior="blurAndSubmit"
        keyboardType="default"
        textContentType="none"
        autoFocus
        autoCapitalize="sentences"
        autoCorrect
        accessibilityLabel={accessibilityLabel}
      />
      <Animated.View pointerEvents="none" style={[styles.editUnderline, underlineStyle]} />
    </View>
  )
}

export default memo(ItemTextEditor)
