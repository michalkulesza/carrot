import { View } from 'react-native'
import Animated from 'react-native-reanimated'
import { SymbolView } from 'expo-symbols'
import { BottomSheetView } from '@gorhom/bottom-sheet'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AppText, Button, Card } from '../ui'
import { palette, space, useMotion } from '../../theme'
import { getSourceLabel } from './helpers'
import SheetInput from './SheetInput'
import { styles } from './styles'

interface LinkSheetProps {
  url: string
  normalizedUrl: string | null
  isUnsupported: boolean
  loading: boolean
  onUrlChange: (value: string) => void
  onPaste: () => void
  onImport: () => void
  onOpenInBrowser: () => void
}

const SourcePreview = ({ normalizedUrl }: { normalizedUrl: string }) => {
  const { t } = useTranslation()
  const motion = useMotion()
  const source = getSourceLabel(normalizedUrl)
  const name = 'known' in source ? t(`addRecipe.source.${source.known}`) : source.host

  return (
    <Animated.View entering={motion.entering}>
      <Card padding="md" style={styles.sourceCard}>
        <View style={styles.sourceTile}>
          <SymbolView name="link" size={18} weight="semibold" tintColor={palette.actionText} />
        </View>
        <View style={styles.sourceText}>
          <AppText variant="body" style={styles.sourceName} numberOfLines={1}>
            {name}
          </AppText>
          <AppText variant="tileMeta" tone="textTertiary">
            {t('addRecipe.sourcePreview')}
          </AppText>
        </View>
      </Card>
    </Animated.View>
  )
}

const LinkSheet = ({
  url,
  normalizedUrl,
  isUnsupported,
  loading,
  onUrlChange,
  onPaste,
  onImport,
  onOpenInBrowser,
}: LinkSheetProps) => {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const canImport = normalizedUrl !== null && !isUnsupported
  const bodyPadding = { paddingBottom: Math.max(insets.bottom, space.lg) }

  return (
    <BottomSheetView style={[styles.sheetBody, bodyPadding]}>
      <AppText variant="bodyLarge" style={styles.sheetTitle}>
        {t('addRecipe.importFromLink')}
      </AppText>

      <View style={styles.inputRow}>
        <SheetInput
          variant="field"
          value={url}
          onChangeText={onUrlChange}
          placeholder={t('addRecipe.urlPlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          onSubmitEditing={onImport}
          textContentType="URL"
          accessibilityLabel={t('addRecipe.recipeUrl')}
        />
        <Button variant="secondary" size="lg" icon="doc.on.clipboard" label={t('addRecipe.paste')} onPress={onPaste} />
      </View>

      {isUnsupported ? (
        <>
          <AppText variant="meta" tone="textSecondary">
            {t('addRecipe.unsupportedUrl')}
          </AppText>
          <Button variant="secondary" size="lg" label={t('addRecipe.openInBrowser')} onPress={onOpenInBrowser} />
        </>
      ) : null}
      {canImport && normalizedUrl ? <SourcePreview normalizedUrl={normalizedUrl} /> : null}

      <Button
        size="xl"
        fullWidth
        label={t('addRecipe.import')}
        onPress={onImport}
        disabled={!canImport}
        loading={loading}
      />
      <AppText variant="tileMeta" tone="textTertiary" style={styles.footnote}>
        {t('addRecipe.backgroundHint')}
      </AppText>
    </BottomSheetView>
  )
}

export default LinkSheet
