import {
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
} from 'react'
import { useTranslation } from 'react-i18next'

const OTP_LENGTH = 6
const BOX_INDEXES = [0, 1, 2, 3, 4, 5]

type OtpState = 'default' | 'verified' | 'error'

interface OtpInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit?: () => void
  disabled?: boolean
  state?: OtpState
}

const toDigits = (raw: string) => raw.replace(/\D/g, '')

const getBoxClasses = (hasDigit: boolean, state: OtpState) => {
  if (state === 'verified') return 'border-mint-border bg-mint-wash'
  if (state === 'error') return 'border-danger bg-white'

  return hasDigit ? 'border-carrot bg-carrot-wash' : 'border-line bg-white'
}

const OtpInput = ({
  value,
  onChange,
  onSubmit,
  disabled = false,
  state = 'default',
}: OtpInputProps) => {
  const { t } = useTranslation()
  const boxRefs = useRef<Array<HTMLInputElement | null>>([])

  useEffect(() => {
    if (!disabled) boxRefs.current[0]?.focus()
  }, [disabled])

  const focusBox = (index: number) => {
    boxRefs.current[Math.max(0, Math.min(OTP_LENGTH - 1, index))]?.focus()
  }

  // Writes digits starting at `index`, clamped so the value never has gaps.
  const insertDigits = (index: number, digits: string) => {
    const start = Math.min(index, value.length)
    const next = (
      value.slice(0, start) +
      digits +
      value.slice(start + digits.length)
    ).slice(0, OTP_LENGTH)

    onChange(next)
    focusBox(start + digits.length)
  }

  const handleChange = (
    index: number,
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const digits = toDigits(event.target.value)

    if (!digits) {
      onChange(value.slice(0, index) + value.slice(index + 1))

      return
    }

    insertDigits(index, digits)
  }

  const handleKeyDown = (
    index: number,
    event: KeyboardEvent<HTMLInputElement>
  ) => {
    switch (event.key) {
      case 'Backspace':
        if (!value[index] && index > 0) {
          event.preventDefault()
          onChange(value.slice(0, index - 1) + value.slice(index))
          focusBox(index - 1)
        }
        break
      case 'ArrowLeft':
        event.preventDefault()
        focusBox(index - 1)
        break
      case 'ArrowRight':
        event.preventDefault()
        focusBox(index + 1)
        break
      case 'Enter':
        event.preventDefault()
        if (value.length === OTP_LENGTH) onSubmit?.()
        break
    }
  }

  const handlePaste = (
    index: number,
    event: ClipboardEvent<HTMLInputElement>
  ) => {
    const digits = toDigits(event.clipboardData.getData('text'))
    if (!digits) return

    event.preventDefault()
    insertDigits(index, digits.slice(0, OTP_LENGTH - index))
  }

  return (
    <div
      role="group"
      aria-label={t('auth.codePlaceholder')}
      className="grid grid-cols-6 gap-2"
    >
      {BOX_INDEXES.map((index) => (
        <input
          key={index}
          ref={(element) => {
            boxRefs.current[index] = element
          }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          aria-label={t('auth.codeDigit', {
            index: index + 1,
            total: OTP_LENGTH,
          })}
          aria-invalid={state === 'error'}
          placeholder="·"
          disabled={disabled}
          value={value[index] ?? ''}
          onChange={(event) => handleChange(index, event)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={(event) => handlePaste(index, event)}
          onFocus={(event) => event.target.select()}
          className={`h-[58px] w-full min-w-0 rounded-xl border-[1.5px] p-0 text-center text-2xl font-extrabold text-ink transition-colors placeholder:text-ink-faint focus:border-carrot focus:outline-none focus:ring-3 focus:ring-carrot-tint disabled:opacity-60 ${getBoxClasses(Boolean(value[index]), state)}`}
        />
      ))}
    </div>
  )
}

export default OtpInput
