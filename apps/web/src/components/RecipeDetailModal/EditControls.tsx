import type { ReactNode } from 'react'

export const GripIcon = ({ className = '' }: { className?: string }) => (
  <svg
    width="12"
    height="16"
    viewBox="0 0 12 16"
    fill="currentColor"
    aria-hidden="true"
    className={`shrink-0 text-[#C9C6D1] ${className}`}
  >
    <circle cx="3" cy="3" r="1.5" />
    <circle cx="9" cy="3" r="1.5" />
    <circle cx="3" cy="8" r="1.5" />
    <circle cx="9" cy="8" r="1.5" />
    <circle cx="3" cy="13" r="1.5" />
    <circle cx="9" cy="13" r="1.5" />
  </svg>
)

export const CloseGlyph = ({ size = 14 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
)

export const AddRowButton = ({
  onClick,
  className = '',
  children,
}: {
  onClick: () => void
  className?: string
  children: ReactNode
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex items-center justify-center rounded-xl border-[1.5px] border-dashed border-[#E4E1EA] text-[15px] font-extrabold text-[#E07B39] hover:border-[#F2C6A6] hover:bg-[#FDF4EC] lg:text-sm ${className}`}
  >
    {children}
  </button>
)

export const SectionHeading = ({
  title,
  count,
  children,
}: {
  title: string
  count: string
  children?: ReactNode
}) => (
  <div className="flex items-center gap-2 lg:gap-2.5">
    <span className="text-xl font-extrabold lg:text-lg">{title}</span>
    <span className="flex-1 text-sm font-semibold text-[#8C8A99]">{count}</span>
    {children}
  </div>
)
