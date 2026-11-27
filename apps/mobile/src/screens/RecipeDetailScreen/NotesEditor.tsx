import { memo, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Alert, Keyboard, View, type GestureResponderEvent, type TextInput } from 'react-native'
import Animated, { FadeIn, FadeInUp, FadeOut, LayoutAnimationConfig, LinearTransition } from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { SectionHeader } from '../../components/ui'
import { settleEasing } from '../../theme'
import HeaderAddButton from './HeaderAddButton'
import NoteCardBackdrop from './NoteCardBackdrop'
import NoteContent from './NoteContent'
import QuietRow from './QuietRow'
import { ScrollIntoViewContext } from './ScrollIntoViewContext'
import { styles } from './styles'

const SECTION_TOP_GAP = 36
const CARD_LAYOUT = LinearTransition.duration(340).easing(settleEasing)
const QUIET_ENTERING = FadeIn.duration(180)
const QUIET_EXITING = FadeOut.duration(180)
const NOTE_ENTERING = FadeInUp.delay(80).duration(250)
const NOTE_EXITING = FadeOut.duration(180)

const stopTouchPropagation = (event: GestureResponderEvent) => event.stopPropagation()

interface NotesEditorProps {
  notes: string | null
  onSave: (notes: string) => Promise<void>
  onValueChange?: (text: string) => void
}

const NotesEditor = ({ notes, onSave, onValueChange }: NotesEditorProps) => {
  const { t } = useTranslation()
  const { scrollIntoView, release } = useContext(ScrollIntoViewContext)
  const [open, setOpen] = useState(Boolean(notes))
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(notes ?? '')
  const inputRef = useRef<TextInput>(null)
  const containerRef = useRef<View>(null)
  const editingRef = useRef(false)
  const valueRef = useRef(notes ?? '')
  const editBaseRef = useRef('')
  const savedNotesRef = useRef(notes ?? '')
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

  useEffect(() => {
    savedNotesRef.current = notes ?? ''
    if (editingRef.current) return

    setValue(notes ?? '')
    valueRef.current = notes ?? ''
    setOpen(Boolean(notes))
  }, [notes])

  useEffect(() => release, [release])

  useEffect(
    () => () => {
      if (!editingRef.current) return

      const trimmed = valueRef.current.trim()
      if (trimmed === editBaseRef.current.trim() || trimmed === savedNotesRef.current) return

      onSaveRef.current(trimmed).catch(() => undefined)
    },
    [],
  )

  const handleChangeText = useCallback(
    (text: string) => {
      valueRef.current = text
      setValue(text)
      onValueChange?.(text)
    },
    [onValueChange],
  )

  const startEditing = useCallback(() => {
    editBaseRef.current = savedNotesRef.current
    editingRef.current = true
    setOpen(true)
    setEditing(true)
  }, [])

  const finishEditing = useCallback(async () => {
    if (!editingRef.current) return

    editingRef.current = false
    release()
    setEditing(false)

    const trimmed = valueRef.current.trim()

    if (trimmed === editBaseRef.current.trim()) {
      const latest = savedNotesRef.current
      valueRef.current = latest
      setValue(latest)
      setOpen(Boolean(latest))
      return
    }

    if (!trimmed) setOpen(false)
    valueRef.current = trimmed
    setValue(trimmed)
    if (trimmed === savedNotesRef.current) return

    const previous = savedNotesRef.current
    savedNotesRef.current = trimmed

    try {
      await onSave(trimmed)
    } catch {
      savedNotesRef.current = previous

      if (!trimmed) {
        valueRef.current = previous
        setValue(previous)
        setOpen(Boolean(previous))
      }

      Alert.alert(t('common.somethingWentWrong'), t('addRecipe.saveError'))
    }
  }, [onSave, t, release])

  const handleFinishEditing = useCallback(() => {
    if (inputRef.current?.isFocused()) {
      Keyboard.dismiss()
      return
    }

    void finishEditing()
  }, [finishEditing])

  const handleBlur = useCallback(() => void finishEditing(), [finishEditing])

  const handleFocus = useCallback(() => {
    const end = valueRef.current.length
    inputRef.current?.setSelection(end, end)
  }, [])

  const handleInputLayout = useCallback(() => scrollIntoView(containerRef.current), [scrollIntoView])

  const handleAction = editing ? handleFinishEditing : startEditing
  const headerAction = <HeaderAddButton label={t('common.add')} accessibilityLabel={t('recipes.addNote')} onPress={startEditing} visible={!open} />

  return (
    <>
      <SectionHeader title={t('recipes.notes')} topGap={SECTION_TOP_GAP} action={headerAction} />
      <View style={styles.noteWrapper}>
        <LayoutAnimationConfig skipEntering>
          <Animated.View
            ref={containerRef}
            style={styles.noteContainer}
            layout={CARD_LAYOUT}
            collapsable={false}
            onTouchStart={stopTouchPropagation}
          >
            <NoteCardBackdrop open={open} editing={editing} />
            {open ? (
              <Animated.View key="note" style={styles.noteContent} entering={NOTE_ENTERING} exiting={NOTE_EXITING}>
                <NoteContent
                  editing={editing}
                  value={value}
                  inputRef={inputRef}
                  onChangeText={handleChangeText}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                  onLayout={handleInputLayout}
                  onEdit={startEditing}
                  onAction={handleAction}
                />
              </Animated.View>
            ) : (
              <Animated.View key="quiet" entering={QUIET_ENTERING} exiting={QUIET_EXITING}>
                <QuietRow
                  symbol="note.text"
                  title={t('recipes.notesEmptyTitle')}
                  hint={t('recipes.notesEmptyHint')}
                  onPress={startEditing}
                />
              </Animated.View>
            )}
          </Animated.View>
        </LayoutAnimationConfig>
      </View>
    </>
  )
}

export default memo(NotesEditor)
