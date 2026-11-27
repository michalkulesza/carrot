import { useCallback, useMemo, useRef, useState } from 'react'
import { Alert } from 'react-native'
import * as Haptics from 'expo-haptics'
import { useNavigation, useRouter } from 'expo-router'
import { usePreventRemove } from '@react-navigation/native'
import type { TFunction } from 'i18next'
import { useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@carrot/shared/api/client'
import type { RecipeOut, Tag } from '@carrot/shared/types'
import { makeTempRecipeId } from '../../api/uploadThumbnail'
import { buildEmptyDraft, buildNewRecipeSaveRequest, type EditDraft } from '../RecipeDetailScreen/helpers'
import { useDraftMutators } from '../RecipeDetailScreen/useDraftMutators'
import { useThumbnailPicker } from '../RecipeDetailScreen/useThumbnailPicker'

const EMPTY_SNAPSHOT = JSON.stringify({ draft: buildEmptyDraft(), tagIds: [], notes: '', relatedIds: [] })

export const useNewRecipeDraft = ({ api, t }: { api: ApiClient; t: TFunction }) => {
  const router = useRouter()
  const navigation = useNavigation()
  const qc = useQueryClient()

  const [draft, setDraft] = useState<EditDraft | null>(buildEmptyDraft)
  const [tags, setTags] = useState<Tag[]>([])
  const [notes, setNotes] = useState('')
  const [related, setRelated] = useState<RecipeOut[]>([])
  const [saving, setSaving] = useState(false)
  const [tempRecipeId] = useState(makeTempRecipeId)
  const savingRef = useRef(false)
  const notesRef = useRef('')

  const handleThumbnailUploaded = useCallback(
    (url: string) => setDraft((prev) => prev && { ...prev, thumbnail_url: url }),
    [],
  )
  const thumbnailPicker = useThumbnailPicker({ recipeId: tempRecipeId, t, onUploaded: handleThumbnailUploaded })
  const mutators = useDraftMutators(setDraft)

  const isDirty = useMemo(
    () =>
      JSON.stringify({
        draft,
        tagIds: tags.map((tag) => tag.id),
        notes: notes.trim(),
        relatedIds: related.map((recipe) => recipe.id),
      }) !== EMPTY_SNAPSHOT,
    [draft, tags, notes, related],
  )
  const canSave = !!draft && draft.title.trim() !== '' && !saving

  const handleNotesInput = useCallback((value: string) => {
    notesRef.current = value
    setNotes(value)
  }, [])

  const handleNotesChange = useCallback(
    async (value: string) => handleNotesInput(value),
    [handleNotesInput],
  )

  const handleCancel = useCallback(() => {
    if (savingRef.current) return

    router.back()
  }, [router])

  const handleRemovePrevented = useCallback(
    ({ data }: { data: { action: Parameters<typeof navigation.dispatch>[0] } }) => {
      const handleDiscardOnPress = () => navigation.dispatch(data.action)

      Alert.alert(t('addRecipe.discardChangesTitle'), t('addRecipe.discardChangesMessage'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('addRecipe.discard'), style: 'destructive', onPress: handleDiscardOnPress },
      ])
    },
    [navigation, t],
  )

  usePreventRemove(isDirty && !saving, handleRemovePrevented)

  const saveRelated = useCallback(
    async (recipeId: string) => {
      if (related.length === 0) return

      try {
        await api.setRelatedRecipes(recipeId, related.map((recipe) => recipe.id))
      } catch {
        Alert.alert(t('common.somethingWentWrong'), t('addRecipe.saveError'))
      }
    },
    [api, related, t],
  )

  const handleSave = useCallback(async () => {
    if (savingRef.current || !draft || draft.title.trim() === '') return

    savingRef.current = true
    setSaving(true)

    try {
      const payload = buildNewRecipeSaveRequest(draft, { tagIds: tags.map((tag) => tag.id), notes: notesRef.current.trim() || null })
      const created = await api.saveRecipe(payload)

      qc.setQueryData<RecipeOut[]>(['recipes'], (prev) => (prev ? [created, ...prev.filter((r) => r.id !== created.id)] : prev))
      void qc.invalidateQueries({ queryKey: ['recipes'] })
      void qc.invalidateQueries({ queryKey: ['allergen-recheck-status'] })

      await saveRelated(created.id)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      router.replace(`/recipe/${created.id}`)
    } catch {
      savingRef.current = false
      setSaving(false)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      Alert.alert(t('common.somethingWentWrong'), t('addRecipe.saveError'))
    }
  }, [draft, tags, api, qc, saveRelated, router, t])

  return {
    draft,
    setDraft,
    tags,
    setTags,
    notes: notes || null,
    handleNotesChange,
    handleNotesInput,
    related,
    setRelated,
    saving,
    isDirty,
    canSave,
    handleCancel,
    handleSave,
    ...thumbnailPicker,
    ...mutators,
  }
}
