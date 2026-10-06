import type { ReactNode } from 'react'

interface NextMealCardLabelProps {
  children: ReactNode
}

const NextMealCardLabel = ({ children }: NextMealCardLabelProps) => (
  <span className="block text-[11px] font-extrabold uppercase tracking-[.08em] text-ink-muted">
    {children}
  </span>
)

export default NextMealCardLabel
