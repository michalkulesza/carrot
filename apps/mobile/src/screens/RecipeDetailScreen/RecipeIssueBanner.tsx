import { useCallback, useState } from 'react'
import { Linking, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { RecipeIssueCode } from '@carrot/shared/types'
import { AppText, Button, Card } from '../../components/ui'
import { styles } from './styles'

interface RecipeIssueBannerProps {
  issueCodes: RecipeIssueCode[]
  sourceUrl: string | null
  onDismiss: (issueCode: RecipeIssueCode) => Promise<void>
}

const RecipeIssueBanner = ({ issueCodes, sourceUrl, onDismiss }: RecipeIssueBannerProps) => {
  const { t } = useTranslation()
  const [busyCode, setBusyCode] = useState<RecipeIssueCode | null>(null)
  const [dismissed, setDismissed] = useState<Set<RecipeIssueCode>>(new Set())
  const [hasError, setHasError] = useState(false)
  const visibleIssues = issueCodes.filter((code) => !dismissed.has(code))

  const handleDismiss = useCallback(
    async (code: RecipeIssueCode) => {
      if (busyCode) return
      setBusyCode(code)
      try {
        await onDismiss(code)
        setDismissed((current) => new Set(current).add(code))
        setHasError(false)
      } catch {
        setHasError(true)
      } finally {
        setBusyCode(null)
      }
    },
    [busyCode, onDismiss],
  )

  const handleOpenSource = useCallback(() => {
    if (sourceUrl) void Linking.openURL(sourceUrl)
  }, [sourceUrl])

  if (visibleIssues.length === 0) return null

  return (
    <Card tone="attention" padding="md">
      <View accessibilityLiveRegion="polite" style={styles.issueContent}>
        {visibleIssues.map((code) => {
          const messageKey = code === 'MISSING_INGREDIENTS' ? 'recipes.missingIngredientsIssue' : 'recipes.missingInstructionsIssue'
          const actionLabel = busyCode === code ? t('common.saving') : t('recipes.dismissExtractionIssue')

          return (
            <View key={code} style={styles.issueRow}>
              <AppText variant="body" tone="tintText" style={styles.issueText}>
                {t(messageKey)}
              </AppText>
              <Button
                variant="text"
                size="sm"
                label={actionLabel}
                accessibilityLabel={t('recipes.dismissExtractionIssue')}
                disabled={busyCode !== null}
                onPress={() => handleDismiss(code)}
              />
            </View>
          )
        })}
        {hasError ? (
          <AppText variant="meta" tone="error" accessibilityRole="alert">
            {t('common.somethingWentWrong')}
          </AppText>
        ) : null}
        {sourceUrl ? (
          <Button variant="text" size="sm" label={t('recipes.viewRecipeSource')} onPress={handleOpenSource} />
        ) : null}
      </View>
    </Card>
  )
}

export default RecipeIssueBanner
