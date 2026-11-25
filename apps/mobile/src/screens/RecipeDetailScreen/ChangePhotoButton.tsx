import { memo, useCallback } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { SymbolView } from 'expo-symbols'
import { useTranslation } from 'react-i18next'
import GlassViewSafe, { glassAvailable } from '../../components/GlassViewSafe'
import { lightHaptic } from '../../components/ui/haptics'
import { palette } from '../../theme'
import { styles } from './styles'

interface ChangePhotoButtonProps {
  uploading: boolean
  onPress: () => void
}

const ChangePhotoButton = ({ uploading, onPress }: ChangePhotoButtonProps) => {
  const { t } = useTranslation()

  const handlePress = useCallback(() => {
    lightHaptic()
    onPress()
  }, [onPress])

  const label = uploading ? t('common.uploading') : t('common.changePhoto')

  return (
    <Pressable
      onPress={handlePress}
      disabled={uploading}
      accessibilityRole="button"
      accessibilityLabel={t('common.changePhoto')}
      accessibilityState={{ busy: uploading, disabled: uploading }}
    >
      <View style={styles.changePhotoButton}>
        {glassAvailable ? <GlassViewSafe style={StyleSheet.absoluteFill} /> : null}
        {uploading ? (
          <ActivityIndicator size="small" color={palette.ink} />
        ) : (
          <SymbolView name="camera" size={16} weight="semibold" tintColor={palette.ink} />
        )}
        <Text style={styles.changePhotoText}>{label}</Text>
      </View>
    </Pressable>
  )
}

export default memo(ChangePhotoButton)
