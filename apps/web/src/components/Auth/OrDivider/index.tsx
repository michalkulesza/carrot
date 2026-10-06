import { useTranslation } from 'react-i18next'

const OrDivider = () => {
  const { t } = useTranslation()

  return (
    <div className="flex items-center gap-3 text-[13px] font-bold text-ink-faint">
      <div className="h-px flex-1 bg-line" />
      {t('auth.orDivider')}
      <div className="h-px flex-1 bg-line" />
    </div>
  )
}

export default OrDivider
