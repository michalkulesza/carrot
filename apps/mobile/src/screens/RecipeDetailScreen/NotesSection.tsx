import { useCallback, useEffect, useState } from 'react'
import { Alert, Pressable, Text, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '@carrot/shared/api/context'
import type { RecipeOut } from '@carrot/shared/types'
import { styles } from './styles'
import { buildRecipeSaveRequest, FONT_SIZES, LINE_HEIGHTS } from './helpers'

const NotesSection = ({ recipe, fontSizeIndex }: { recipe: RecipeOut; fontSizeIndex: number }) => {
  const { t } = useTranslation()
  const api = useApiClient()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(recipe.notes ?? '')

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
      Alert.alert(t('common.ok'), t('addRecipe.saveError'))
    }
  }, [value, recipe, api, qc, t])

  if (editing) {
    return (
      <View style={styles.notesBlock}>
        <Text style={styles.sectionLabel}>{t('recipes.notes')}</Text>
        <TextInput
          style={[styles.notesText, styles.notesInput]}
          value={value}
          onChangeText={setValue}
          onBlur={handleBlur}
          autoFocus
          multiline
          placeholder={t('common.tapToAddNotes')}
          accessibilityLabel={t('recipes.notes')}
        />
      </View>
    )
  }

  return (
    <Pressable onPress={() => setEditing(true)} accessibilityLabel={t('recipes.notes')} accessibilityRole="button">
      <View style={styles.notesBlock}>
        <Text style={styles.sectionLabel}>{t('recipes.notes')}</Text>
        <Text
          style={[
            styles.notesText,
            { fontSize: FONT_SIZES[fontSizeIndex], lineHeight: LINE_HEIGHTS[fontSizeIndex] },
            !recipe.notes && styles.notesPlaceholder,
          ]}
        >
          {recipe.notes || t('common.tapToAddNotes')}
        </Text>
      </View>
    </Pressable>
  )
}

export default NotesSection
