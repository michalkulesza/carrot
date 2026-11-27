import { useCallback, useState } from 'react'
import { Alert } from 'react-native'
import * as Haptics from 'expo-haptics'
import * as ImagePicker from 'expo-image-picker'
import type { TFunction } from 'i18next'
import { uploadThumbnailImage } from '../../api/uploadThumbnail'

export const useThumbnailPicker = ({
  recipeId,
  t,
  onUploaded,
}: {
  recipeId: string
  t: TFunction
  onUploaded: (url: string) => void
}) => {
  const [uploadingThumb, setUploadingThumb] = useState(false)
  const [thumbErrored, setThumbErrored] = useState(false)

  const handlePickThumbnail = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
      allowsEditing: false,
    })
    if (result.canceled || !result.assets[0]) return

    const asset = result.assets[0]
    setUploadingThumb(true)
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    try {
      const data = await uploadThumbnailImage(recipeId, asset)
      onUploaded(data.url)
      setThumbErrored(false)
    } catch {
      Alert.alert(t('common.somethingWentWrong'), t('common.uploadFailed'))
    } finally {
      setUploadingThumb(false)
    }
  }, [recipeId, t, onUploaded])

  return { uploadingThumb, thumbErrored, setThumbErrored, handlePickThumbnail }
}
