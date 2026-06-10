import { useTranslation } from 'react-i18next'
import PageHeader from '../components/PageHeader'

export default function ShoppingListPage() {
  const { t } = useTranslation()

  return (
    <>
      <PageHeader title={t('shoppingList.title')} />
      <div className="flex flex-col items-center justify-center py-24 text-zinc-400 px-4 text-center">
        <p className="text-lg">{t('shoppingList.comingSoon')}</p>
      </div>
    </>
  )
}
