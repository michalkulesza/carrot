import { Search, X } from 'react-feather'
import { useTranslation } from 'react-i18next'

interface RecipeSearchInputProps {
  searchQuery: string
  isSemanticLoading?: boolean
  onSearchQueryChange: (value: string) => void
}

const RecipeSearchInput = ({
  searchQuery,
  isSemanticLoading = false,
  onSearchQueryChange,
}: RecipeSearchInputProps) => {
  const { t } = useTranslation()

  return (
    <div className="relative flex items-center w-full">
      <Search className="absolute left-3 w-4 h-4 text-zinc-400 pointer-events-none" />
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => onSearchQueryChange(e.target.value)}
        placeholder={t('recipes.searchPlaceholder')}
        className="w-full pl-9 pr-8 py-2 text-sm rounded-full bg-white border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-zinc-400"
      />
      {isSemanticLoading && (
        <span className="absolute right-8 h-3 w-3 rounded-full border-2 border-zinc-300 border-t-primary animate-spin" aria-label={t('recipes.semanticSearchLoading')} />
      )}
      {searchQuery && (
        <button
          type="button"
          onClick={() => onSearchQueryChange('')}
          className="absolute right-3 text-zinc-400 hover:text-zinc-600 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}

export default RecipeSearchInput
