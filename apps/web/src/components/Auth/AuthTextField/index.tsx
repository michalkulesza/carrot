import type { InputHTMLAttributes, ReactNode } from 'react'

type FieldTone = 'default' | 'valid'
type TrailingSize = 'badge' | 'text'

interface AuthTextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string
  label: string
  labelAside?: ReactNode
  trailing?: ReactNode
  trailingSize?: TrailingSize
  tone?: FieldTone
  children?: ReactNode
}

const TONE_CLASSES: Record<FieldTone, string> = {
  default: 'border-line',
  valid: 'border-mint-border',
}

const TRAILING_PADDING: Record<TrailingSize, string> = {
  badge: 'pr-11',
  text: 'pr-16',
}

const AuthTextField = ({
  id,
  label,
  labelAside,
  trailing,
  trailingSize = 'badge',
  tone = 'default',
  children,
  className = '',
  ...inputProps
}: AuthTextFieldProps) => {
  const paddingClass = trailing ? TRAILING_PADDING[trailingSize] : 'pr-3.5'

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-bold text-ink">
          {label}
        </label>
        {labelAside && (
          <span className="text-[13px] font-semibold text-ink-faint">
            {labelAside}
          </span>
        )}
      </div>
      <div className="relative flex items-center">
        <input
          id={id}
          className={`h-[52px] w-full rounded-xl border-[1.5px] bg-white pl-3.5 text-base text-ink transition-colors placeholder:text-ink-faint focus:border-carrot focus:outline-none focus:ring-3 focus:ring-carrot-tint disabled:opacity-60 lg:h-12 ${TONE_CLASSES[tone]} ${paddingClass} ${className}`}
          {...inputProps}
        />
        {trailing && <div className="absolute right-3 flex">{trailing}</div>}
      </div>
      {children}
    </div>
  )
}

export default AuthTextField
