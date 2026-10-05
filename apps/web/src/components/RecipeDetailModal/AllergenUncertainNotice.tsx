import { useTranslation } from 'react-i18next'
import { HelpIcon } from './PopupIcons'

const AllergenUncertainNotice = () => {
  const { t } = useTranslation()

  return (
    <div
      role="note"
      className="flex items-center gap-2.5 rounded-xl bg-[#FEF3DC] px-3.5 py-3 text-[13px] font-semibold leading-snug text-[#9A5508]"
    >
      <HelpIcon size={18} className="shrink-0" />
      <span>{t('recipes.allergensUncertain')}</span>
    </div>
  )
}

export default AllergenUncertainNotice
