import type { ReactNode } from 'react'
import { Spinner } from '@heroui/react'

interface RecipeActionButtonProps {
  icon: ReactNode
  label: string
  ariaLabel: string
  onClick: () => void
  desktop: boolean
  colorClassName?: string
  pending?: boolean
}

const DESKTOP_CLASS_NAME = 'flex items-center gap-1.5'
const MOBILE_CLASS_NAME =
  'flex h-14 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-xs active:bg-[#F4F3F7]'

const RecipeActionButton = ({
  icon,
  label,
  ariaLabel,
  onClick,
  desktop,
  colorClassName = 'text-[#4A4858]',
  pending = false,
}: RecipeActionButtonProps) => {
  const layoutClassName = desktop ? DESKTOP_CLASS_NAME : MOBILE_CLASS_NAME
  const labelVisibility = pending ? 'invisible' : ''

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      disabled={pending}
      aria-busy={pending}
      className={`${layoutClassName} ${colorClassName} disabled:cursor-wait`}
    >
      <span className="flex">{icon}</span>
      <span className="relative">
        <span className={labelVisibility}>{label}</span>
        {pending && (
          <span className="absolute inset-0 flex items-center justify-center">
            <Spinner size="sm" />
          </span>
        )}
      </span>
    </button>
  )
}

export default RecipeActionButton
