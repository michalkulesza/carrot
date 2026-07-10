import { useState, useRef, useEffect } from 'react'
import { Globe } from 'react-feather'
import { useTranslation } from 'react-i18next'

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pl', label: 'Polski' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
]

const getLanguageOptionClassName = (active: boolean) =>
  `w-full text-left px-3 py-2 text-sm transition-colors ${
    active
      ? 'bg-primary/10 text-primary font-medium'
      : 'text-zinc-700 hover:bg-zinc-50'
  }`

const LanguageSwitcher = () => {
  const { i18n, t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)

    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function select(code: string) {
    i18n.changeLanguage(code)
    setOpen(false)
  }

  return (
    <div ref={ref} className="absolute top-4 right-4 z-10">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="p-2 rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 transition-colors"
        aria-label={t('auth.chooseLanguage')}
      >
        <Globe size={18} />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-36 rounded-xl bg-white border border-zinc-200 shadow-lg overflow-hidden">
          {LANGUAGES.map(({ code, label }) => (
            <button
              key={code}
              type="button"
              onClick={() => select(code)}
              className={getLanguageOptionClassName(i18n.language === code)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default LanguageSwitcher
