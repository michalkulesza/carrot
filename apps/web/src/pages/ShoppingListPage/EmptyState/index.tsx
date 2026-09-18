import { useTranslation } from 'react-i18next'

const EmptyState = () => {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-center justify-center py-16 text-zinc-400 px-4 md:px-6 text-center">
      <p className="text-sm">{t('shoppingList.addItemPlaceholder')}</p>
    </div>
  )
}

export default EmptyState
