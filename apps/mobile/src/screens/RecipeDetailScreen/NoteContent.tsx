import { memo, useMemo, type RefObject } from 'react'
import { Pressable, Text, TextInput, View, type LayoutChangeEvent } from 'react-native'
import { useTranslation } from 'react-i18next'
import { AppText } from '../../components/ui'
import { palette } from '../../theme'
import { styles } from './styles'

const ACTION_HIT_SLOP = { top: 8, bottom: 8, left: 12, right: 12 }

interface NoteBodyProps {
  editing: boolean
  value: string
  inputRef: RefObject<TextInput | null>
  onChangeText: (text: string) => void
  onFocus: () => void
  onBlur: () => void
  onLayout: (event: LayoutChangeEvent) => void
  onEdit: () => void
}

const NoteBody = ({ editing, value, inputRef, onChangeText, onFocus, onBlur, onLayout, onEdit }: NoteBodyProps) => {
  const { t } = useTranslation()
  const inputStyle = useMemo(() => [styles.noteBody, styles.noteInput], [])
  const placeholderStyle = useMemo(() => [styles.noteBody, styles.notePlaceholder], [])

  if (editing) {
    return (
      <TextInput
        ref={inputRef}
        style={inputStyle}
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        onBlur={onBlur}
        onLayout={onLayout}
        autoFocus
        multiline
        scrollEnabled={false}
        placeholder={t('recipes.notePlaceholderOpen')}
        placeholderTextColor={palette.placeholder}
        selectionColor={palette.action}
        accessibilityLabel={t('recipes.notes')}
      />
    )
  }

  const readStyle = value ? styles.noteBody : placeholderStyle

  return (
    <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel={t('recipes.notes')}>
      <Text style={readStyle}>{value || t('recipes.notePlaceholderOpen')}</Text>
    </Pressable>
  )
}

interface NoteContentProps extends NoteBodyProps {
  onAction: () => void
}

const NoteContent = ({ onAction, ...bodyProps }: NoteContentProps) => {
  const { t } = useTranslation()
  const actionLabel = bodyProps.editing ? t('common.done') : t('common.edit')

  return (
    <>
      <View style={styles.noteHeader}>
        <AppText variant="pillSmall" tone="noteText" style={styles.noteLabel}>
          {t('recipes.yourNote')}
        </AppText>
        <Pressable
          style={styles.noteAction}
          onPress={onAction}
          hitSlop={ACTION_HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={styles.noteActionLabel}>{actionLabel}</Text>
        </Pressable>
      </View>
      <NoteBody {...bodyProps} />
    </>
  )
}

export default memo(NoteContent)
