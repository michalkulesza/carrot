import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Book, Calendar, ShoppingCart, Settings, Plus } from 'react-feather'

interface BottomNavProps {
  onAddRecipe: () => void
}

const active =
  'text-primary flex flex-col items-center gap-0.5 flex-1 pt-3 pb-2 text-xs font-medium'
const idle =
  'text-zinc-400 flex flex-col items-center gap-0.5 flex-1 pt-3 pb-2 text-xs'

export default function BottomNav({ onAddRecipe }: BottomNavProps) {
  const { t } = useTranslation()

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-zinc-100"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-end max-w-lg mx-auto">
        <NavLink
          to="/"
          end
          className={({ isActive }) => (isActive ? active : idle)}
        >
          <Book size={22} />
          <span>{t('nav.recipes')}</span>
        </NavLink>

        <NavLink
          to="/plan"
          className={({ isActive }) => (isActive ? active : idle)}
        >
          <Calendar size={22} />
          <span>{t('nav.mealPlan')}</span>
        </NavLink>

        {/* Centre FAB */}
        <div className="flex flex-col items-center flex-1 -mt-6 pb-2">
          <button
            onClick={onAddRecipe}
            className="w-14 h-14 rounded-full bg-primary text-white shadow-lg flex items-center justify-center text-2xl active:scale-95 transition-transform"
            aria-label={t('nav.addRecipe')}
          >
            <Plus size={20} strokeWidth={2.5} />
          </button>
          <span className="text-xs text-zinc-400 mt-1">
            {t('nav.addRecipe')}
          </span>
        </div>

        <NavLink
          to="/shopping"
          className={({ isActive }) => (isActive ? active : idle)}
        >
          <ShoppingCart size={22} />
          <span>{t('nav.shopping')}</span>
        </NavLink>

        <NavLink
          to="/settings"
          className={({ isActive }) => (isActive ? active : idle)}
        >
          <Settings size={22} />
          <span>{t('nav.settings')}</span>
        </NavLink>
      </div>
    </nav>
  )
}
