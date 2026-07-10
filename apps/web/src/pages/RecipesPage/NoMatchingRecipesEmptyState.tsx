import { useTranslation } from 'react-i18next'

interface NoMatchingRecipesEmptyStateProps {
  filterFavourites: boolean
  filterTag: boolean
  onClearFilters: () => void
}

const NoMatchingRecipesEmptyState = ({
  filterFavourites,
  filterTag,
  onClearFilters,
}: NoMatchingRecipesEmptyStateProps) => {
  const { t } = useTranslation()
  const message =
    filterFavourites && !filterTag
      ? t('recipes.noFavourites')
      : t('recipes.noRecipesWithTag')

  return (
    <div className="flex flex-col items-center justify-center py-24 text-zinc-400 px-4 text-center">
      <p className="text-lg">{message}</p>
      <button onClick={onClearFilters} className="text-sm text-primary mt-1">
        {t('recipes.clearFilter')}
      </button>
    </div>
  )
}

export default NoMatchingRecipesEmptyState
