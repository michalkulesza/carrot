import { useTranslation } from 'react-i18next'
import BrandMark from '../components/BrandMark'
import DemoPass from '../components/DemoPass'
import Footer from '../components/Footer'
import ProductShot from '../components/ProductShot'

const WEB_APP_URL = 'https://app.carrot.xcxz.xyz/'

const SOON_BADGE_CLASS =
  'flex h-13.5 shrink-0 items-center gap-2 whitespace-nowrap rounded-button border-2 border-dashed border-line-strong px-4 text-sm font-extrabold text-ink-subtle'

const GlobeIcon = () => (
  <svg
    aria-hidden="true"
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </svg>
)

const PhoneIcon = () => (
  <svg
    aria-hidden="true"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <rect x="6" y="2" width="12" height="20" rx="3" />
    <path d="M11 18h2" />
  </svg>
)

const AndroidIcon = () => (
  <svg
    aria-hidden="true"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <rect x="5" y="8" width="14" height="11" rx="2" />
    <path d="M8 8a4 4 0 0 1 8 0M8 4l1.5 2M16 4l-1.5 2" />
  </svg>
)

const Showcase = () => {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-canvas bg-dot-grid font-nunito text-ink">
      <main className="mx-auto my-auto flex w-full max-w-7xl flex-col gap-16 px-4 pt-10 pb-12 sm:px-10 xl:flex-row xl:items-start xl:justify-between xl:gap-8 xl:px-18 xl:pt-16 xl:pr-50">
        <div className="flex w-full max-w-130 flex-col gap-6.5 max-xl:mx-auto">
          <div className="flex items-center gap-2.5">
            <BrandMark size="lg" />
            <span className="text-2xl font-extrabold">Carrot</span>
          </div>

          <div className="flex flex-col gap-3">
            <h1 className="text-4xl font-extrabold tracking-tight whitespace-pre-line sm:text-hero">
              {t('showcase.headline')}
            </h1>
            <p className="text-lg leading-normal font-semibold text-ink-muted">
              {t('showcase.subtitle')}
            </p>
          </div>

          <DemoPass />

          <div className="flex flex-wrap gap-2.5">
            <a
              href={WEB_APP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-13.5 shrink-0 items-center gap-2.5 rounded-button bg-carrot px-5.5 text-base font-extrabold whitespace-nowrap text-white shadow-cta transition-colors hover:bg-carrot-strong"
            >
              <GlobeIcon />
              {t('showcase.cta.web')}
            </a>
            <span className={SOON_BADGE_CLASS}>
              <PhoneIcon />
              {t('showcase.cta.ios')}
            </span>
            <span className={SOON_BADGE_CLASS}>
              <AndroidIcon />
              {t('showcase.cta.android')}
            </span>
          </div>
        </div>

        <ProductShot />
      </main>

      <Footer />
    </div>
  )
}

export default Showcase
