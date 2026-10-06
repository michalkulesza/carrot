import type { ReactNode } from 'react'

interface FeatureCardProps {
  label: string
  icon: ReactNode
  /** Background and foreground classes for the icon tile. */
  accentClassName: string
  children: ReactNode
}

const FeatureCard = ({
  label,
  icon,
  accentClassName,
  children,
}: FeatureCardProps) => (
  <div className="flex w-60 flex-col gap-3 rounded-[20px] border border-line bg-white p-4">
    <div className="flex items-center gap-2">
      <span
        className={`flex size-6.5 shrink-0 items-center justify-center rounded-lg ${accentClassName}`}
      >
        {icon}
      </span>
      <span className="text-[11px] font-extrabold tracking-[.08em] text-ink-subtle uppercase">
        {label}
      </span>
    </div>
    {children}
  </div>
)

export default FeatureCard
