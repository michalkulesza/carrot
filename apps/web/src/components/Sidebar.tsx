import { useCallback, useState, type ComponentType } from 'react'
import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Book,
  Calendar,
  ShoppingCart,
  Settings,
  Sidebar as SidebarIcon,
  ChevronDown,
} from 'react-feather'
import HouseholdSwitcher from './HouseholdSwitcher'
import { useHousehold } from '../context/HouseholdContext'

interface NavItem {
  to: string
  end: boolean
  labelKey: string
  Icon: ComponentType<{ size?: number }>
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', end: true, labelKey: 'nav.recipes', Icon: Book },
  { to: '/plan', end: false, labelKey: 'nav.mealPlan', Icon: Calendar },
  { to: '/shopping', end: false, labelKey: 'nav.shopping', Icon: ShoppingCart },
  { to: '/settings', end: false, labelKey: 'nav.settings', Icon: Settings },
]

interface SidebarNavLinkProps {
  to: string
  end: boolean
  label: string
  Icon: ComponentType<{ size?: number }>
  collapsed: boolean
}

const SidebarNavLink = ({
  to,
  end,
  label,
  Icon,
  collapsed,
}: SidebarNavLinkProps) => {
  const getClassName = useCallback(
    ({ isActive }: { isActive: boolean }) =>
      `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
        collapsed ? 'justify-center' : ''
      } ${
        isActive
          ? 'bg-primary/10 text-primary'
          : 'text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900'
      }`,
    [collapsed]
  )

  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      className={getClassName}
    >
      <Icon size={18} />
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  )
}

const Sidebar = () => {
  const { activeHousehold } = useHousehold()
  const { t } = useTranslation()
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const bandColor = activeHousehold?.color ?? null

  const handleSwitcherClose = useCallback(() => setSwitcherOpen(false), [])

  const toggleSidebarLabel = collapsed
    ? t('nav.expandSidebar')
    : t('nav.collapseSidebar')
  const householdSwitcherTitle = collapsed
    ? (activeHousehold?.name ?? t('nav.personalLibrary'))
    : undefined
  const householdLabel = activeHousehold
    ? activeHousehold.name
    : t('nav.personalLibrary')
  const bandDotStyle = bandColor
    ? { width: 8, height: 8, backgroundColor: bandColor }
    : {
        width: 8,
        height: 8,
        border: '1.5px solid currentColor',
        display: 'inline-block',
        borderRadius: '50%',
      }

  return (
    <aside
      className={`hidden md:flex flex-col shrink-0 sticky top-0 h-screen py-4 px-3 transition-[width] duration-200 overflow-hidden ${
        collapsed ? 'w-[72px]' : 'w-60'
      }`}
    >
      <div
        className={`flex items-center mb-5 ${collapsed ? 'justify-center' : 'justify-between px-1'}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <img
            src="/favicon.svg"
            alt=""
            className="w-7 h-7 rounded-lg shrink-0"
          />
          {!collapsed && (
            <span className="text-lg font-bold tracking-tight truncate">
              Carrot
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-900 transition-colors shrink-0"
          aria-label={toggleSidebarLabel}
        >
          <SidebarIcon size={18} />
        </button>
      </div>

      <button
        type="button"
        onClick={() => setSwitcherOpen(true)}
        title={householdSwitcherTitle}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-zinc-200/60 transition-colors mb-3 w-full text-left ${
          collapsed ? 'justify-center' : ''
        }`}
      >
        <span className="shrink-0 rounded-full" style={bandDotStyle} />
        {!collapsed && (
          <>
            <span
              className="text-xs font-semibold uppercase tracking-wide truncate"
              style={{ color: bandColor ?? undefined }}
            >
              {householdLabel}
            </span>
            <ChevronDown
              size={12}
              strokeWidth={2.5}
              className="shrink-0 opacity-50 ml-auto"
            />
          </>
        )}
      </button>

      <div className="h-px bg-zinc-200 mx-1 mb-3" />

      <nav className="flex flex-col gap-0.5 flex-1">
        {NAV_ITEMS.map(({ to, end, labelKey, Icon }) => (
          <SidebarNavLink
            key={to}
            to={to}
            end={end}
            label={t(labelKey)}
            Icon={Icon}
            collapsed={collapsed}
          />
        ))}
      </nav>

      <HouseholdSwitcher isOpen={switcherOpen} onClose={handleSwitcherClose} />
    </aside>
  )
}

export default Sidebar
