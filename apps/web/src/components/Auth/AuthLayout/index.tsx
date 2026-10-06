import type { ReactNode } from 'react'
import LanguageSwitcher from '../../LanguageSwitcher'
import AuthBrand from '../AuthBrand'
import FeatureOrbit from '../FeatureOrbit'

interface AuthLayoutProps {
  children: ReactNode
}

const MAIN_CLASS =
  'relative flex min-h-dvh flex-col bg-white font-nunito text-ink lg:items-center lg:justify-center lg:overflow-hidden lg:bg-canvas lg:bg-[radial-gradient(var(--color-line-strong)_1.2px,transparent_1.3px)] lg:bg-size-[22px_22px]'

const CARD_CLASS =
  'flex flex-1 flex-col justify-center gap-4.5 px-5.5 pt-2 pb-10 lg:relative lg:z-30 lg:w-100 lg:flex-none lg:-translate-x-37.5 lg:justify-start lg:rounded-3xl lg:bg-white lg:px-9 lg:py-8.5 lg:shadow-[0_30px_70px_rgba(31,29,43,.16)]'

const AuthLayout = ({ children }: AuthLayoutProps) => (
  <main className={MAIN_CLASS}>
    <div className="absolute top-0 right-0 z-50 size-0">
      <LanguageSwitcher />
    </div>
    <FeatureOrbit />
    <AuthBrand className="flex px-5.5 pt-5 lg:hidden" />
    <div className={CARD_CLASS}>
      <AuthBrand className="hidden lg:flex" />
      {children}
    </div>
  </main>
)

export default AuthLayout
