import type { MouseEvent, ReactNode } from 'react'

type SubmitVariant = 'ready' | 'muted' | 'success'

interface AuthSubmitButtonProps {
  variant: SubmitVariant
  isBusy?: boolean
  children: ReactNode
}

const VARIANT_CLASSES: Record<SubmitVariant, string> = {
  ready: 'bg-carrot hover:-translate-y-px hover:bg-carrot-hover',
  muted: 'cursor-default bg-carrot-muted',
  success: 'bg-mint',
}

const AuthSubmitButton = ({
  variant,
  isBusy = false,
  children,
}: AuthSubmitButtonProps) => {
  const isBlocked = variant === 'muted' || isBusy

  // aria-disabled keeps the button focusable while still blocking submission.
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (isBlocked) event.preventDefault()
  }

  return (
    <button
      type="submit"
      aria-disabled={isBlocked}
      aria-busy={isBusy}
      onClick={handleClick}
      className={`h-[50px] w-full rounded-[14px] text-base font-extrabold text-white transition active:scale-[.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-carrot ${VARIANT_CLASSES[variant]}`}
    >
      {children}
    </button>
  )
}

export default AuthSubmitButton
