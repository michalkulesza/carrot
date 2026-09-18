import { useRef, useState } from 'react'
import type { ComponentType } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useGSAP } from '@gsap/react'
import { gsap } from 'gsap'
import {
  Book,
  Calendar,
  Plus,
  ShoppingCart,
  Settings,
  Sidebar as SidebarIcon,
  ChevronDown,
} from 'react-feather'
import HouseholdSwitcher from '../HouseholdSwitcher'
import NextMealCard from '../NextMealCard'
import { useHousehold } from '../../context/HouseholdContext'
import SidebarLink from './SidebarLink'

gsap.registerPlugin(useGSAP)

interface NavItem {
  to: string
  end: boolean
  labelKey: string
  Icon: ComponentType<{ size?: number; className?: string }>
}

interface SidebarProps {
  hideNextMeal?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', end: true, labelKey: 'nav.recipes', Icon: Book },
  { to: '/plan', end: false, labelKey: 'nav.mealPlan', Icon: Calendar },
  { to: '/shopping', end: false, labelKey: 'nav.shopping', Icon: ShoppingCart },
  { to: '/', end: true, labelKey: 'nav.newHousehold', Icon: Plus },
  { to: '/settings', end: false, labelKey: 'nav.settings', Icon: Settings },
]

const GATED_VISIBLE_LABEL_KEYS = new Set(['nav.newHousehold', 'nav.settings'])

const Sidebar = ({ hideNextMeal = false }: SidebarProps) => {
  const { households, activeHousehold } = useHousehold()
  const { t } = useTranslation()
  const sidebarRef = useRef<HTMLElement>(null)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const isGated = households.length === 0
  const navItems = isGated
    ? NAV_ITEMS.filter((item) => GATED_VISIBLE_LABEL_KEYS.has(item.labelKey))
    : NAV_ITEMS.filter((item) => item.labelKey !== 'nav.newHousehold')
  const bandColor = activeHousehold?.color ?? null

  const handleSwitcherClose = () => {
    setSwitcherOpen(false)
  }

  useGSAP(
    () => {
      const sidebar = sidebarRef.current
      if (sidebar === null) return

      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const labels = Array.from(sidebar.querySelectorAll<HTMLElement>('[data-sidebar-label]'))
      const navLinks = Array.from(sidebar.querySelectorAll<HTMLElement>('[data-sidebar-nav-link]'))
      const householdButton = sidebar.querySelector<HTMLElement>('[data-sidebar-household]')
      const householdTargets = householdButton ? [householdButton] : []

      if (reduceMotion) {
        gsap.set(sidebar, { width: collapsed ? 58 : 290, paddingLeft: 8, paddingRight: 8 })
        gsap.set(labels, { autoAlpha: collapsed ? 0 : 1, maxWidth: collapsed ? 0 : 192 })
        gsap.set(navLinks, { columnGap: collapsed ? 0 : 12 })
        gsap.set(householdTargets, { columnGap: collapsed ? 0 : 8 })

        return
      }

      const timeline = gsap.timeline({ defaults: { ease: 'power2.inOut', overwrite: 'auto' } })

      if (collapsed) {
        timeline
          .to(labels, { autoAlpha: 0, maxWidth: 0, duration: 0.12 }, 0)
          .to(navLinks, { columnGap: 0, duration: 0.25 }, 0)
          .to(householdTargets, { columnGap: 0, duration: 0.25 }, 0)
          .to(sidebar, { width: 58, duration: 0.25 }, 0)
      } else {
        timeline
          .to(sidebar, { width: 290, duration: 0.25 }, 0)
          .to(navLinks, { columnGap: 12, duration: 0.25 }, 0)
          .to(householdTargets, { columnGap: 8, duration: 0.25 }, 0)
          .to(labels, { autoAlpha: 1, maxWidth: 192, duration: 0.16 }, 0.25)
      }
    },
    { dependencies: [collapsed], scope: sidebarRef }
  )

  const toggleSidebarLabel = collapsed
    ? t('nav.expandSidebar')
    : t('nav.collapseSidebar')
  const householdSwitcherTitle = collapsed ? activeHousehold?.name : undefined
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
      ref={sidebarRef}
      className="hidden md:flex z-[69] flex-col shrink-0 sticky top-0 h-screen w-[290px] py-4 px-2 overflow-visible"
    >
      <div className="flex items-center mb-5">
        <Link to="/" className="flex flex-none items-center gap-2 min-w-0">
          <img
            src="/favicon.svg"
            alt=""
            className="w-7 h-7 rounded-lg flex-none"
          />
          <span
            aria-hidden={collapsed}
            data-sidebar-label
            className="max-w-24 overflow-hidden whitespace-nowrap text-lg font-bold tracking-tight"
          >
            Carrot
          </span>
        </Link>
      </div>

      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        className="absolute top-4 right-[-13px] z-20 cursor-pointer rounded-lg p-1 text-zinc-500 bg-zinc-100 hover:bg-zinc-200 hover:text-zinc-900 transition-colors shadow-sm"
        aria-label={toggleSidebarLabel}
      >
        <SidebarIcon size={18} />
      </button>

      {!isGated && (
        <>
          <button
            type="button"
            onClick={() => setSwitcherOpen(true)}
            title={householdSwitcherTitle}
            data-sidebar-household
            className="flex items-center justify-start gap-2 px-3 py-2 rounded-xl hover:bg-zinc-200/60 transition-colors mb-3 w-full text-left cursor-pointer"
          >
            <span className="shrink-0 rounded-full" style={bandDotStyle} />
            <span
              aria-hidden={collapsed}
              data-sidebar-label
              className="flex min-w-0 max-w-48 items-center overflow-hidden whitespace-nowrap"
            >
              <span
                className="text-xs font-semibold uppercase tracking-wide truncate"
                style={{ color: bandColor ?? undefined }}
              >
                {activeHousehold?.name}
              </span>
              <ChevronDown
                size={12}
                strokeWidth={2.5}
                className="shrink-0 opacity-50 ml-auto"
              />
            </span>
          </button>

          <div className="h-px bg-zinc-200 mx-1 mb-3" />
        </>
      )}

      {!isGated && !hideNextMeal && (
        <NextMealCard compact={collapsed} className="mb-3" />
      )}

      <nav className="flex flex-col gap-0.5 flex-1">
        {navItems.map(({ to, end, labelKey, Icon }) => (
          <SidebarLink
            key={labelKey}
            to={to}
            end={end}
            label={t(labelKey)}
            Icon={Icon}
            collapsed={collapsed}
          />
        ))}
      </nav>

      {!isGated && (
        <HouseholdSwitcher isOpen={switcherOpen} onClose={handleSwitcherClose} />
      )}
    </aside>
  )
}

export default Sidebar
