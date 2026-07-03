import { useState } from 'react'
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

export default function Sidebar() {
  const { activeHousehold } = useHousehold()
  const { t } = useTranslation()
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const bandColor = activeHousehold?.color ?? null

  const navLink = (isActive: boolean) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
      collapsed ? 'justify-center' : ''
    } ${
      isActive
        ? 'bg-primary/10 text-primary'
        : 'text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900'
    }`

  return (
    <aside
      className={`hidden md:flex flex-col shrink-0 sticky top-0 h-screen py-4 px-3 transition-[width] duration-200 overflow-hidden ${
        collapsed ? 'w-[72px]' : 'w-60'
      }`}
    >
      {/* Header: logo + toggle */}
      <div
        className={`flex items-center mb-5 ${collapsed ? 'justify-center' : 'justify-between px-1'}`}
      >
        {!collapsed && (
          <span className="text-lg font-bold tracking-tight">Carrot</span>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-900 transition-colors shrink-0"
          aria-label={
            collapsed
              ? t('nav.expandSidebar', { defaultValue: 'Expand sidebar' })
              : t('nav.collapseSidebar', { defaultValue: 'Collapse sidebar' })
          }
        >
          <SidebarIcon size={18} />
        </button>
      </div>

      {/* Household switcher */}
      <button
        type="button"
        onClick={() => setSwitcherOpen(true)}
        title={
          collapsed
            ? (activeHousehold?.name ?? t('nav.personalLibrary'))
            : undefined
        }
        className={`flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-zinc-200/60 transition-colors mb-3 w-full text-left ${
          collapsed ? 'justify-center' : ''
        }`}
      >
        <span
          className="shrink-0 rounded-full"
          style={
            bandColor
              ? { width: 8, height: 8, backgroundColor: bandColor }
              : {
                  width: 8,
                  height: 8,
                  border: '1.5px solid currentColor',
                  display: 'inline-block',
                  borderRadius: '50%',
                }
          }
        />
        {!collapsed && (
          <>
            <span
              className="text-xs font-semibold uppercase tracking-wide truncate"
              style={{ color: bandColor ?? undefined }}
            >
              {activeHousehold
                ? activeHousehold.name
                : t('nav.personalLibrary')}
            </span>
            <ChevronDown size={12} strokeWidth={2.5} className="shrink-0 opacity-50 ml-auto" />
          </>
        )}
      </button>

      {/* Divider */}
      <div className="h-px bg-zinc-200 mx-1 mb-3" />

      {/* Nav links */}
      <nav className="flex flex-col gap-0.5 flex-1">
        {[
          { to: '/', end: true, labelKey: 'nav.recipes', Icon: Book },
          {
            to: '/plan',
            end: false,
            labelKey: 'nav.mealPlan',
            Icon: Calendar,
          },
          {
            to: '/shopping',
            end: false,
            labelKey: 'nav.shopping',
            Icon: ShoppingCart,
          },
          {
            to: '/settings',
            end: false,
            labelKey: 'nav.settings',
            Icon: Settings,
          },
        ].map(({ to, end, labelKey, Icon }) => {
          const label = t(labelKey)

          return (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={collapsed ? label : undefined}
              className={({ isActive }) => navLink(isActive)}
            >
              <Icon size={18} />
              {!collapsed && <span className="truncate">{label}</span>}
            </NavLink>
          )
        })}
      </nav>

      <HouseholdSwitcher
        isOpen={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
      />
    </aside>
  )
}
