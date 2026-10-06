import type { ReactNode } from 'react'

interface FeatureIconProps {
  children: ReactNode
}

const FeatureIcon = ({ children }: FeatureIconProps) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
)

export const UsersIcon = () => (
  <FeatureIcon>
    <path d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1" />
    <circle cx="9" cy="7" r="3.5" />
    <path d="M22 19v-1a4 4 0 0 0-3-3.9M16 3.1a3.5 3.5 0 0 1 0 7.8" />
  </FeatureIcon>
)

export const WarningIcon = () => (
  <FeatureIcon>
    <path d="M12 3 2 20h20z" />
    <path d="M12 10v4M12 17h.01" />
  </FeatureIcon>
)

export const LinkIcon = () => (
  <FeatureIcon>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </FeatureIcon>
)

export const ScaleIcon = () => (
  <FeatureIcon>
    <path d="M4 12h16M4 12l4-4M4 12l4 4M20 12l-4-4M20 12l-4 4" />
  </FeatureIcon>
)

export const UnitsIcon = () => (
  <FeatureIcon>
    <path d="M7 4v16M7 4 4 7M7 4l3 3M17 20V4M17 20l-3-3M17 20l3-3" />
  </FeatureIcon>
)

export const TimerIcon = () => (
  <FeatureIcon>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2.5 2M9 2h6" />
  </FeatureIcon>
)

export const CalendarIcon = () => (
  <FeatureIcon>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </FeatureIcon>
)
