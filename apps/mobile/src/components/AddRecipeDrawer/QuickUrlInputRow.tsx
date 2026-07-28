import { PlatformColor, Pressable, Text, View } from 'react-native'
import { BottomSheetTextInput } from '@gorhom/bottom-sheet'
import { useTranslation } from 'react-i18next'
import PrimaryButton from '../PrimaryButton'
import { colors } from '../../theme/colors'
import { styles } from './styles'

const QuickUrlInputRow = ({
  url,
  onUrlChange,
  onPaste,
  onImport,
  loading,
  canImport,
}: {
  url: string
  onUrlChange: (v: string) => void
  onPaste: () => void
  onImport: () => void
  loading: boolean
  canImport: boolean
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
          style={({ pressed }) => [
            styles.pasteIconBtn,
            !canImport && styles.urlPasteButtonInvalid,
            pressed && { opacity: 0.7 },
          ]}
          onPress={onPaste}
          accessibilityLabel={t('addRecipe.paste')}
          hitSlop={8}
        >
          <Text style={[styles.pasteIconBtnText, !canImport && styles.urlPasteButtonInvalidText]}>
            {t('addRecipe.paste')}
          </Text>
        </Pressable>
      </View>
      <PrimaryButton
        onPress={onImport}
        disabled={!canImport || loading}
        loading={loading}
        label={t('addRecipe.import')}
        accessibilityLabel={t('addRecipe.import')}
        tintColor={colors.orange}
        disabledTintColor={colors.secondaryBackground}
        disabledTextColor={colors.secondaryLabel}
        disabledBorderColor={colors.opaqueSeparator}
      />
    </View>
  )
}

export default QuickUrlInputRow
