import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { RecipeIssueCode } from '@carrot/shared/types'

interface RecipeIssueBannerProps {
  issueCodes: RecipeIssueCode[]
  sourceUrl: string | null
  onDismiss: (issueCode: RecipeIssueCode) => Promise<void>
}

const RecipeIssueBanner = ({
  issueCodes,
  sourceUrl,
  onDismiss,
}: RecipeIssueBannerProps) => {
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
    <section
      className="mx-5 my-4 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-foreground sm:mx-10"
      aria-live="polite"
    >
      <div className="space-y-3">
        {visibleIssues.map((code) => (
          <div
            key={code}
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <p>
              {t(
                code === 'MISSING_INGREDIENTS'
                  ? 'recipes.missingIngredientsIssue'
                  : 'recipes.missingInstructionsIssue'
              )}
            </p>
            <button
              type="button"
              onClick={() => void handleDismiss(code)}
              disabled={busyCode !== null}
              className="rounded-md px-2 py-1 text-xs font-semibold text-primary hover:underline disabled:opacity-50"
            >
              {busyCode === code
                ? t('common.saving')
                : t('recipes.dismissExtractionIssue')}
            </button>
          </div>
        ))}
      </div>
      {hasError && (
        <p role="alert" className="mt-2 text-danger">
          {t('common.somethingWentWrong')}
        </p>
      )}
      {sourceUrl && (
        <a
          className="mt-3 inline-block font-semibold text-primary underline"
          href={sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          {t('recipes.viewRecipeSource')}
        </a>
      )}
    </section>
  )
}

export default RecipeIssueBanner
