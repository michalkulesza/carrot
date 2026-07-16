import { ActivityIndicator, PlatformColor, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Feather } from '@expo/vector-icons'
import NetworkImage from '../../components/NetworkImage'
import { proxyThumbnailUrl } from '../../api/thumbnailUrl'
import { styles } from './styles'

const RecipeHeroImage = ({
  thumbnailUrl,
  title,
  editing,
  uploadingThumb,
  emptySpacerHeight,
  onPickImage,
}: {
  thumbnailUrl: string | null
  title: string
  editing: boolean
  uploadingThumb: boolean
  emptySpacerHeight: number
  onPickImage: () => void
}) => {
  const { t } = useTranslation()

  if (thumbnailUrl) {
    return (
      <View>
        <NetworkImage
          uri={proxyThumbnailUrl(thumbnailUrl)!}
          style={styles.previewHeroImage}
          accessibilityLabel={title}
        />
        {editing && (
          <Pressable
            style={({ pressed }) => [styles.previewHeroEditBtn, pressed && { opacity: 0.7 }]}
            onPress={onPickImage}
            disabled={uploadingThumb}
            accessibilityLabel={t('common.changePhoto')}
          >
            {uploadingThumb ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Feather name="camera" size={14} color="#ffffff" />
            )}
            <Text style={styles.previewHeroEditText}>
              {uploadingThumb ? t('common.uploading') : t('common.changePhoto')}
            </Text>
          </Pressable>
        )}
      </View>
    )
  }

  if (editing) {
    return (
      <Pressable
        style={({ pressed }) => [styles.previewHeroImage, styles.previewHeroPlaceholder, pressed && { opacity: 0.7 }]}
        onPress={onPickImage}
        disabled={uploadingThumb}
        accessibilityLabel={t('common.addPhoto')}
      >
        {uploadingThumb ? (
          <ActivityIndicator size="small" />
        ) : (
          <>
            <Feather name="camera" size={28} color={PlatformColor('secondaryLabel') as unknown as string} />
            <Text style={styles.previewHeroPlaceholderText}>{t('common.addPhoto')}</Text>
          </>
        )}
      </Pressable>
    )
  }

  return <View style={{ height: emptySpacerHeight }} />
}

export default RecipeHeroImage
