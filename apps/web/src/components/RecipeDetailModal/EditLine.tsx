import { useEffect, useRef } from 'react'

interface EditLineProps {
  value: string
  onChange: (v: string) => void
  className?: string
  multiline?: boolean
}

const EditLine = ({
  value,
  onChange,
  className = '',
  multiline = false,
}: EditLineProps) => {
  const base =
    'w-full bg-transparent border-b border-transparent hover:border-zinc-300 focus:border-primary focus:outline-none transition-colors resize-none'
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto'
      ref.current.style.height = `${ref.current.scrollHeight}px`
    }
  }, [value])

  if (multiline) {
    return (
      <textarea
        ref={ref}
        value={value}
        rows={1}
        onChange={(e) => onChange(e.target.value)}
        className={`${base} overflow-hidden ${className}`}
      />
    )
  }

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${base} ${className}`}
    />
  )
}

export default EditLine
