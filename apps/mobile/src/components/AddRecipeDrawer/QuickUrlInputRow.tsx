import { PlatformColor, Pressable, Text, View } from 'react-native'
import { BottomSheetTextInput } from '@gorhom/bottom-sheet'
import { useTranslation } from 'react-i18next'
import PrimaryButton from '../PrimaryButton'
import { styles } from './styles'

const QuickUrlInputRow = ({
  url,
  onUrlChange,
  onPaste,
  onImport,
  loading,
}: {
  url: string
  onUrlChange: (v: string) => void
  onPaste: () => void
  onImport: () => void
  loading: boolean
}) => {
  const { t } = useTranslation()

  return (
    <View style={styles.quickUrlSection}>
      <View style={styles.urlInputGroup}>
        <BottomSheetTextInput
          style={styles.urlInput}
          value={url}
          onChangeText={onUrlChange}
          placeholder={t('addRecipe.urlPlaceholder')}
          placeholderTextColor={PlatformColor('placeholderText') as unknown as string}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          onSubmitEditing={onImport}
          accessibilityLabel={t('addRecipe.recipeUrl')}
          textContentType="URL"
        />
        <Pressable
          style={({ pressed }) => [styles.pasteIconBtn, pressed && { opacity: 0.7 }]}
          onPress={onPaste}
          accessibilityLabel={t('addRecipe.paste')}
          hitSlop={8}
        >
          <Text style={styles.pasteIconBtnText}>{t('addRecipe.paste')}</Text>
        </Pressable>
      </View>
      <PrimaryButton
        onPress={onImport}
        disabled={!url.trim() || loading}
        loading={loading}
        label={t('addRecipe.import')}
        accessibilityLabel={t('addRecipe.import')}
      />
    </View>
  )
}

export default QuickUrlInputRow
