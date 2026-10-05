import { useTranslation } from 'react-i18next'
import { useDismissRecipeIssue } from '@carrot/shared/hooks/useRecipes'
import type { RecipeOut } from '@carrot/shared/types'
import RecipeIssueBanner from './RecipeIssueBanner'

interface RecipeNoticesProps {
  recipe: RecipeOut
  error: string | null
  spacingClassName?: string
  hideAllergenNotice?: boolean
}

const RecipeNotices = ({
  recipe,
  error,
  spacingClassName = '',
  hideAllergenNotice = false,
}: RecipeNoticesProps) => {
  const { t } = useTranslation()
  const dismissIssue = useDismissRecipeIssue()

  return (
    <>
      <RecipeIssueBanner
        key={recipe.id}
        issueCodes={recipe.issue_codes ?? []}
        sourceUrl={recipe.source_url}
        onDismiss={(issueCode) =>
          dismissIssue
            .mutateAsync({ id: recipe.id, issueCode })
            .then(() => undefined)
        }
      />
      {!hideAllergenNotice && recipe.allergen_status === 'uncertain' && (
        <p
          className={`rounded-lg bg-warning/10 p-3 text-sm text-zinc-600 ${spacingClassName}`}
        >
          {t('recipes.allergensUncertain')}
        </p>
      )}
      {error && (
        <div
          className={`bg-danger-50 text-danger rounded-lg p-3 text-sm ${spacingClassName}`}
        >
          {error}
        </div>
      )}
    </>
  )
}

export default RecipeNotices
