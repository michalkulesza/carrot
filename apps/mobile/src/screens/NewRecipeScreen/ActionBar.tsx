import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'
import PrimaryButton from '../../components/PrimaryButton'
import { styles } from './styles'

const ActionBar = ({
  saving,
  bottomInset,
  onDiscard,
  onSave,
}: {
  saving: boolean
  bottomInset: number
  onDiscard: () => void
  onSave: () => void
}) => {
  const { t } = useTranslation()

  return (
    <View style={[styles.actionBar, { paddingBottom: Math.max(bottomInset, 16) }]}>
      <Pressable
        style={({ pressed }) => [styles.secondaryBtn, styles.flex, pressed && { opacity: 0.7 }]}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          onDiscard()
        }}
        disabled={saving}
        accessibilityLabel={t('addRecipe.discard')}
      >
        <Text style={styles.secondaryBtnText}>{t('addRecipe.discard')}</Text>
      </Pressable>
      <PrimaryButton
        style={styles.flex}
        onPress={onSave}
        disabled={saving}
        loading={saving}
        label={t('common.save')}
        accessibilityLabel={t('common.save')}
      />
    </View>
  )
}

export default ActionBar
