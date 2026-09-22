import { useState } from 'react'
import { Linking, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { RecipeIssueCode } from '@carrot/shared/types'
import { colors } from '../../theme/colors'
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

  if (visibleIssues.length === 0) return null

  const handleDismiss = async (code: RecipeIssueCode) => {
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
  }

  return (
    <View accessibilityLiveRegion="polite" style={styles.issueBanner}>
      {visibleIssues.map((code) => (
        <View key={code} style={styles.issueRow}>
          <Text style={styles.issueText}>{t(code === 'MISSING_INGREDIENTS' ? 'recipes.missingIngredientsIssue' : 'recipes.missingInstructionsIssue')}</Text>
          <Pressable onPress={() => void handleDismiss(code)} disabled={busyCode !== null} accessibilityRole="button" accessibilityLabel={t('recipes.dismissExtractionIssue')}>
            <Text style={[styles.issueAction, busyCode ? { opacity: 0.5 } : null]}>{busyCode === code ? t('common.saving') : t('recipes.dismissExtractionIssue')}</Text>
          </Pressable>
        </View>
      ))}
      {hasError && <Text accessibilityRole="alert" style={styles.issueError}>{t('common.somethingWentWrong')}</Text>}
      {sourceUrl && (
        <Pressable onPress={() => void Linking.openURL(sourceUrl)} accessibilityRole="link">
          <Text style={styles.issueAction}>{t('recipes.viewRecipeSource')}</Text>
        </Pressable>
      )}
    </View>
  )
}

export default RecipeIssueBanner
