import { useTranslation } from 'react-i18next'
import BrandMark from '../components/BrandMark'

const Splash = () => {
  const { t } = useTranslation()

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <div className="flex items-center gap-2.5">
        <BrandMark size="lg" />
        <span className="text-2xl font-extrabold">Carrot</span>
      </div>
      <h1 className="max-w-130 text-4xl font-extrabold tracking-tight sm:text-hero">
        {t('hero.tagline')}
      </h1>
    </div>
  )
}

export default Splash
