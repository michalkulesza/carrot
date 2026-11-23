import type { ComponentType } from 'react'
import { NavLink } from 'react-router-dom'
import InvitationCountBadge from '../../InvitationCountBadge'

interface SidebarLinkProps {
  to: string
  end: boolean
  label: string
  Icon: ComponentType<{ size?: number; className?: string }>
  collapsed: boolean
  badgeCount?: number
  ariaLabel?: string
}

const SidebarLink = ({
  to,
  end,
  label,
  Icon,
  collapsed,
  badgeCount = 0,
  ariaLabel,
}: SidebarLinkProps) => (
  <NavLink
    to={to}
    end={end}
    title={collapsed ? label : undefined}
    aria-label={ariaLabel}
    className={({ isActive }) =>
      `flex items-center justify-start gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
        isActive
          ? 'bg-primary/10 text-primary'
          : 'text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900'
      }`
    }
    data-sidebar-nav-link
  >
    <span className="relative shrink-0">
      <Icon size={18} className="shrink-0" />
      {collapsed && (
        <InvitationCountBadge
          count={badgeCount}
          className="absolute -top-2 -right-2"
        />
      )}
    </span>
    <span
      aria-hidden={collapsed}
      data-sidebar-label
      className="max-w-48 overflow-hidden whitespace-nowrap"
    >
      {label}
    </span>
    {!collapsed && (
      <InvitationCountBadge count={badgeCount} className="ml-auto" />
    )}
  </NavLink>
)

export default SidebarLink
