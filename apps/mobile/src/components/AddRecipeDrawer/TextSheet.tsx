import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AppText, Button } from '../ui'
import { space } from '../../theme'
import SheetInput from './SheetInput'
import { styles } from './styles'

interface TextSheetProps {
  text: string
  loading: boolean
  onTextChange: (value: string) => void
  onPaste: () => void
  onImport: () => void
}

const TextSheet = ({ text, loading, onTextChange, onPaste, onImport }: TextSheetProps) => {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const hasText = text.trim().length > 0
  const bodyPadding = { paddingBottom: Math.max(insets.bottom, space.lg) }

  return (
    <View style={[styles.sheetBody, bodyPadding]}>
      <AppText variant="bodyLarge" style={styles.sheetTitle}>
        {t('addRecipe.methodText')}
      </AppText>

      <SheetInput
        variant="area"
        value={text}
        onChangeText={onTextChange}
        placeholder={t('addRecipe.textPlaceholder')}
        autoCapitalize="sentences"
        autoCorrect
        accessibilityLabel={t('addRecipe.methodText')}
      />

      <View style={styles.pasteRow}>
        <Button variant="secondary" size="lg" icon="doc.on.clipboard" label={t('addRecipe.paste')} onPress={onPaste} />
      </View>

      <Button
        size="xl"
        fullWidth
        label={t('addRecipe.import')}
        onPress={onImport}
        disabled={!hasText}
        loading={loading}
      />
    </View>
  )
}

export default TextSheet
