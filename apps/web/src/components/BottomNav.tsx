import { ReactNode } from 'react'
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

const getNavLinkClassName = ({ isActive }: { isActive: boolean }) =>
  isActive ? active : idle

interface NavItemProps {
  to: string
  end?: boolean
  icon: ReactNode
  label: string
}

const NavItem = ({ to, end, icon, label }: NavItemProps) => (
  <NavLink to={to} end={end} className={getNavLinkClassName}>
    {icon}
    <span>{label}</span>
  </NavLink>
)

interface AddRecipeButtonProps {
  onAddRecipe: () => void
  label: string
}

const AddRecipeButton = ({ onAddRecipe, label }: AddRecipeButtonProps) => (
  <div className="flex flex-col items-center flex-1 -mt-6 pb-2">
    <button
      onClick={onAddRecipe}
      className="w-14 h-14 rounded-full bg-primary text-white shadow-lg flex items-center justify-center text-2xl active:scale-95 transition-transform"
      aria-label={label}
    >
      <Plus size={20} strokeWidth={2.5} />
    </button>
    <span className="text-xs text-zinc-400 mt-1">{label}</span>
  </div>
)

const BottomNav = ({ onAddRecipe }: BottomNavProps) => {
  const { t } = useTranslation()

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-zinc-100 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-end max-w-lg mx-auto">
        <NavItem
          to="/"
          end
          icon={<Book size={22} />}
          label={t('nav.recipes')}
        />
        <NavItem
          to="/plan"
          icon={<Calendar size={22} />}
          label={t('nav.mealPlan')}
        />
        <AddRecipeButton onAddRecipe={onAddRecipe} label={t('nav.addRecipe')} />
        <NavItem
          to="/shopping"
          icon={<ShoppingCart size={22} />}
          label={t('nav.shopping')}
        />
        <NavItem
          to="/settings"
          icon={<Settings size={22} />}
          label={t('nav.settings')}
        />
      </div>
    </nav>
  )
}

export default BottomNav
