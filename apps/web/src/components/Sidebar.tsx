import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import HouseholdSwitcher from './HouseholdSwitcher'
import { useHousehold } from '../context/HouseholdContext'

function BookIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function CartIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function PanelIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="3" width="20" height="18" rx="2" />
      <path d="M9 3v18" />
    </svg>
  )
}

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
          <span className="text-lg font-bold tracking-tight">PlateKeeper</span>
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
          <PanelIcon />
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
            <svg
              className="w-3 h-3 shrink-0 opacity-50 ml-auto"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </>
        )}
      </button>

      {/* Divider */}
      <div className="h-px bg-zinc-200 mx-1 mb-3" />

      {/* Nav links */}
      <nav className="flex flex-col gap-0.5 flex-1">
        {[
          { to: '/', end: true, labelKey: 'nav.recipes', Icon: BookIcon },
          {
            to: '/plan',
            end: false,
            labelKey: 'nav.mealPlan',
            Icon: CalendarIcon,
          },
          {
            to: '/shopping',
            end: false,
            labelKey: 'nav.shopping',
            Icon: CartIcon,
          },
          {
            to: '/settings',
            end: false,
            labelKey: 'nav.settings',
            Icon: GearIcon,
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
              <Icon />
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
