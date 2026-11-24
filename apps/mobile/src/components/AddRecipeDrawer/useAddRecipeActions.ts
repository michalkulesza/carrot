import { useCallback, useRef, useState } from 'react'
import { Alert, Linking } from 'react-native'
import { useTranslation } from 'react-i18next'
import * as ImagePicker from 'expo-image-picker'
import * as Haptics from 'expo-haptics'
import { useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '@carrot/shared/api/context'
import { useAuth } from '../../context/AuthContext'
import { enqueueImport } from '../../utils/enqueueImport'
import { usePersonalRecipesToLink } from './usePersonalRecipesToLink'

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7, base64: true }

export const useAddRecipeActions = () => {
  const { t } = useTranslation()
  const api = useApiClient()
  const qc = useQueryClient()
  const { user } = useAuth()
  const { recipes: personalRecipes, activeHouseholdId } = usePersonalRecipesToLink()

  const [loading, setLoading] = useState(false)
  const [linkingRecipeId, setLinkingRecipeId] = useState<string | null>(null)
  const inFlight = useRef(false)

  const guarded = useCallback(async (run: () => Promise<boolean>): Promise<boolean> => {
    if (inFlight.current) return false
    inFlight.current = true

    try {
      return await run()
    } finally {
      inFlight.current = false
    }
  }, [])

  const enqueue = useCallback(
    async (kind: 'url' | 'text' | 'image', input: Record<string, string>): Promise<boolean> => {
      setLoading(true)

      try {
        await enqueueImport(api, qc, kind, input, user)
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)

        return true
      } catch (err) {
        const offline = err instanceof TypeError || (err instanceof Error && /network|offline|fetch/i.test(err.message))
        Alert.alert(t('common.whoops'), offline ? t('common.deviceOffline') : t('common.somethingWentWrong'))

        return false
      } finally {
        setLoading(false)
      }
    },
    [api, qc, t, user],
  )

  const enqueuePickedImage = useCallback(
    async (result: ImagePicker.ImagePickerResult): Promise<boolean> => {
      const asset = result.canceled ? null : result.assets[0]
      if (!asset?.base64) return false

      return enqueue('image', { image_base64: asset.base64, mime_type: asset.mimeType ?? 'image/jpeg' })
    },
    [enqueue],
  )

  const importUrl = useCallback(
    (url: string) => guarded(() => enqueue('url', { url })),
    [guarded, enqueue],
  )

  const importText = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return Promise.resolve(false)

      return guarded(() => enqueue('text', { text: trimmed }))
    },
    [guarded, enqueue],
  )

  const takePhoto = useCallback(
    () =>
      guarded(async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync()
        if (status !== 'granted') {
          Alert.alert(t('addRecipe.cameraPermissionDenied'), t('addRecipe.cameraPermissionDeniedMsg'), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('addRecipe.openSettings'), onPress: () => Linking.openSettings() },
          ])

          return false
        }

        return enqueuePickedImage(await ImagePicker.launchCameraAsync(PICKER_OPTIONS))
      }),
    [guarded, enqueuePickedImage, t],
  )

  const pickFromLibrary = useCallback(
    () => guarded(async () => enqueuePickedImage(await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS))),
    [guarded, enqueuePickedImage],
  )

  const linkPersonalRecipe = useCallback(
    (recipeId: string) =>
      guarded(async () => {
        const recipe = personalRecipes.find((r) => r.id === recipeId)
        if (!activeHouseholdId || !recipe) return false

        setLinkingRecipeId(recipeId)

        try {
          await api.setRecipeHouseholds(recipeId, [...recipe.household_ids, activeHouseholdId])
          await qc.invalidateQueries({ queryKey: ['recipes'] })
          await qc.invalidateQueries({ queryKey: ['recipes', 'mine'] })
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)

          return true
        } catch (err) {
          Alert.alert(t('common.whoops'), err instanceof Error ? err.message : t('addRecipe.failedToAdd'))

          return false
        } finally {
          setLinkingRecipeId(null)
        }
      }),
    [guarded, personalRecipes, activeHouseholdId, api, qc, t],
  )

  return { loading, linkingRecipeId, importUrl, importText, takePhoto, pickFromLibrary, linkPersonalRecipe }
}
