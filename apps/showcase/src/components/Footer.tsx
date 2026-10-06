import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

const FOOTER_LINK_CLASS =
  'text-xs-plus font-bold text-ink-muted transition-colors hover:text-ink'

const Footer = () => {
  const { t } = useTranslation()

  return (
    <footer className="flex w-full items-center justify-center gap-6 px-6 py-6">
      <Link to="/privacy-policy" className={FOOTER_LINK_CLASS}>
        {t('footer.privacyPolicy')}
      </Link>
      <Link to="/support" className={FOOTER_LINK_CLASS}>
        {t('footer.support')}
      </Link>
    </footer>
  )
}

export default Footer
