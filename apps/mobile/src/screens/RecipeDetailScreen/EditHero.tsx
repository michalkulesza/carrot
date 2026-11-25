import { memo, useCallback } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { colors } from '../../theme/colors'
import ChangePhotoButton from './ChangePhotoButton'
import HeroImage from './HeroImage'
import { styles } from './styles'

interface EditHeroProps {
  title: string
  thumbnailUrl: string | null
  topInset: number
  errored: boolean
  uploading: boolean
  onError: (errored: boolean) => void
  onPickThumbnail: () => void
}

const EditHero = ({ title, thumbnailUrl, topInset, errored, uploading, onError, onPickThumbnail }: EditHeroProps) => {
  const { t } = useTranslation()

  const getPlaceholderStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [styles.heroImage, styles.heroPlaceholder, pressed && { opacity: 0.7 }],
    [],
  )

  if (!thumbnailUrl || errored) {
    return (
      <Pressable
        style={getPlaceholderStyle}
        onPress={onPickThumbnail}
        disabled={uploading}
        accessibilityRole="button"
        accessibilityLabel={t('common.addPhoto')}
      >
        {uploading ? (
          <ActivityIndicator size="small" />
        ) : (
          <>
            <Feather name="camera" size={28} color={colors.secondaryLabel} />
            <Text style={styles.heroPlaceholderText}>{t('common.addPhoto')}</Text>
          </>
        )}
      </Pressable>
    )
  }

  return (
    <View>
      <HeroImage title={title} thumbnailUrl={thumbnailUrl} topInset={topInset} errored={errored} onError={onError} />
      <View style={styles.changePhotoWrapper}>
        <ChangePhotoButton uploading={uploading} onPress={onPickThumbnail} />
      </View>
    </View>
  )
}

export default memo(EditHero)
