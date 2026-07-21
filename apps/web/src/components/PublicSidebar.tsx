import { Info, LogIn, UserPlus } from 'react-feather'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

const PublicSidebar = () => {
  const { t } = useTranslation()
  const location = useLocation()
  const loginPath = `/login?next=${encodeURIComponent(location.pathname)}`

  return (
    <aside className="hidden md:flex w-[290px] shrink-0 sticky top-0 h-screen flex-col px-3 py-4">
      <Link to="/marketing" target="_blank" rel="noreferrer" className="mb-5 flex items-center gap-2 px-1">
        <img src="/favicon.svg" alt="" className="h-7 w-7 rounded-lg" />
        <span className="text-lg font-bold tracking-tight">Carrot</span>
      </Link>
      <nav className="flex flex-col gap-0.5">
        <Link to="/marketing" target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900">
          <Info size={18} />
          {t('publicShare.about')}
        </Link>
        <Link to={loginPath} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900">
          <LogIn size={18} />
          {t('publicShare.login')}
        </Link>
        <Link to="/register" target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl bg-primary px-3 py-2.5 text-sm font-medium text-white hover:brightness-95">
          <UserPlus size={18} />
          {t('publicShare.register')}
        </Link>
      </nav>
    </aside>
  )
}

export default PublicSidebar
