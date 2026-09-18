import { useTranslation } from 'react-i18next'

const LoadingState = () => {
  const { t } = useTranslation()

  return (
    <div className="flex items-center justify-center py-24 text-zinc-400">
      <p className="text-sm">{t('common.loading')}</p>
    </div>
  )
}

export default LoadingState
