import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Keyboard, Pressable, Text, TextInput, View, type GestureResponderEvent } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '@carrot/shared/api/context'
import type { RecipeOut } from '@carrot/shared/types'
import { AppText, Card, SectionHeader } from '../../components/ui'
import { palette } from '../../theme'
import { buildRecipeSaveRequest, getReadingMetrics } from './helpers'
import { styles } from './styles'

const SECTION_TOP_GAP = 36

const stopTouchPropagation = (event: GestureResponderEvent) => event.stopPropagation()

const NotesSection = ({ recipe, fontSizeIndex }: { recipe: RecipeOut; fontSizeIndex: number }) => {
  const { t } = useTranslation()
  const api = useApiClient()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(recipe.notes ?? '')

  const { fontSize, noteLineHeight } = useMemo(() => getReadingMetrics(fontSizeIndex), [fontSizeIndex])
  const bodyStyle = useMemo(() => [styles.noteBody, { fontSize, lineHeight: noteLineHeight }], [fontSize, noteLineHeight])
  const inputStyle = useMemo(() => [bodyStyle, styles.noteInput], [bodyStyle])
  const placeholderStyle = useMemo(() => [bodyStyle, styles.notePlaceholder], [bodyStyle])

  useEffect(() => {
    if (!editing) setValue(recipe.notes ?? '')
  }, [recipe.notes, editing])

  const handleBlur = useCallback(async () => {
    setEditing(false)
    const trimmed = value.trim()
    if (trimmed === (recipe.notes ?? '')) return

    try {
      const updated = await api.updateRecipe(recipe.id, buildRecipeSaveRequest(recipe, { notes: trimmed || null }))
      qc.setQueryData<RecipeOut[]>(['recipes'], (prev) => (prev ? prev.map((r) => (r.id === updated.id ? updated : r)) : prev))
    } catch {
      setValue(recipe.notes ?? '')
      Alert.alert(t('common.somethingWentWrong'), t('addRecipe.saveError'))
    }
  }, [value, recipe, api, qc, t])

  const handleStartEditing = useCallback(() => setEditing(true), [])
  const handleFinishEditing = useCallback(() => Keyboard.dismiss(), [])

  return (
    <>
      <SectionHeader title={t('recipes.notes')} topGap={SECTION_TOP_GAP} />
      <View style={styles.noteWrapper}>
        <Card tone="note" style={styles.noteCard}>
          <View style={styles.noteHeader}>
            <AppText variant="badge" tone="noteText" style={styles.noteLabel}>
              {t('recipes.yourNote')}
            </AppText>
            <Pressable
              onPress={editing ? handleFinishEditing : handleStartEditing}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={editing ? t('common.done') : t('common.edit')}
            >
              <AppText variant="badge" tone="noteText">
                {editing ? t('common.done') : t('common.edit')}
              </AppText>
            </Pressable>
          </View>
          {editing ? (
            <TextInput
              style={inputStyle}
              value={value}
              onChangeText={setValue}
              onTouchStart={stopTouchPropagation}
              onBlur={handleBlur}
              autoFocus
              multiline
              placeholder={t('recipes.notesPlaceholder')}
              placeholderTextColor={palette.placeholder}
              accessibilityLabel={t('recipes.notes')}
            />
          ) : (
            <Pressable onPress={handleStartEditing} accessibilityRole="button" accessibilityLabel={t('recipes.notes')}>
              <Text style={recipe.notes ? bodyStyle : placeholderStyle}>{recipe.notes || t('recipes.notesPlaceholder')}</Text>
            </Pressable>
          )}
        </Card>
      </View>
    </>
  )
}

export default memo(NotesSection)
