import { useTranslation } from 'react-i18next'

const NoRecipesEmptyState = () => {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-center justify-center py-24 text-zinc-400 px-4 text-center">
      <p className="text-lg">{t('recipes.noRecipesYet')}</p>
      <p className="text-sm mt-1">{t('recipes.addPrompt')}</p>
    </div>
  )
}

export default NoRecipesEmptyState
