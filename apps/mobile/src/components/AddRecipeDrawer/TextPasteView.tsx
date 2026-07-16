import { PlatformColor, Pressable, Text, View } from 'react-native'
import { BottomSheetTextInput } from '@gorhom/bottom-sheet'
import { useTranslation } from 'react-i18next'
import { Feather } from '@expo/vector-icons'
import PrimaryButton from '../PrimaryButton'
import { styles } from './styles'

const TextPasteView = ({
  text,
  onTextChange,
  onPaste,
  onExtract,
  loading,
}: {
  text: string
  onTextChange: (v: string) => void
  onPaste: () => void
  onExtract: () => void
  loading: boolean
}) => {
  const { t } = useTranslation()

  return (
    <View style={styles.inputSection}>
      <View style={styles.textInputGroup}>
        <BottomSheetTextInput
          style={styles.textPasteInput}
          value={text}
          onChangeText={onTextChange}
          placeholder={t('addRecipe.pasteTextPlaceholder')}
          placeholderTextColor={PlatformColor('placeholderText') as unknown as string}
          multiline
          autoCapitalize="sentences"
          autoCorrect
          accessibilityLabel={t('addRecipe.methodText')}
        />
        <Pressable
          style={({ pressed }) => [styles.textPasteInlineBtn, pressed && { opacity: 0.7 }]}
          onPress={onPaste}
          accessibilityLabel={t('addRecipe.paste')}
        >
          <Feather name="clipboard" size={16} color={PlatformColor('systemBlue') as unknown as string} />
          <Text style={styles.textPasteBtnText}>{t('addRecipe.paste')}</Text>
        </Pressable>
      </View>
      <PrimaryButton
        onPress={onExtract}
        disabled={!text.trim() || loading}
        loading={loading}
        label={t('addRecipe.extractRecipe')}
        accessibilityLabel={t('addRecipe.extractRecipe')}
      />
    </View>
  )
}

export default TextPasteView
