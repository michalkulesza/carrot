import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@heroui/react'
import type { AllergenFlag } from '@carrot/shared/types'

interface AllergenPopoverProps {
  flag: AllergenFlag
  activeAllergens: string[]
  onReplace: () => void
  onRestore: () => void
}

const AllergenPopover = ({
  flag,
  activeAllergens,
  onReplace,
  onRestore,
}: AllergenPopoverProps) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [above, setAbove] = useState(false)
  const [pos, setPos] = useState({ vertical: 0, right: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      )
        setOpen(false)
    }
    const handleScroll = () => {
      setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('scroll', handleScroll, { capture: true })

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('scroll', handleScroll, { capture: true })
    }
  }, [open])

  const isActive =
    flag.allergen &&
    activeAllergens.some((a) => {
      const fa = flag.allergen!.toLowerCase()
      const la = a.toLowerCase()

      return fa === la || fa.includes(la) || la.includes(fa)
    })
  if (!isActive) return null

  const handleOpen = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      const showAbove = r.top > window.innerHeight / 2
      setAbove(showAbove)
      setPos({
        vertical: showAbove ? window.innerHeight - r.top + 4 : r.bottom + 4,
        right: window.innerWidth - r.right,
      })
    }
    setOpen((v) => !v)
  }

  const panelStyle: React.CSSProperties = {
    position: 'fixed',
    right: pos.right,
    zIndex: 9999,
    ...(above ? { bottom: pos.vertical } : { top: pos.vertical }),
  }

  const buttonTitle = flag.substitute_applied
    ? t('recipes.substituteApplied')
    : t('recipes.contains') + ' ' + flag.allergen

  const handleRestoreClick = () => {
    onRestore()
    setOpen(false)
  }

  const handleReplaceClick = () => {
    onReplace()
    setOpen(false)
  }

  return (
    <div className="shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        className={`flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-medium whitespace-nowrap ${
          flag.substitute_applied
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
            : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
        }`}
        title={buttonTitle}
      >
        {flag.substitute_applied ? '✓' : `⚠ ${flag.allergen}`}
      </button>
      {open && (
        <div
          ref={panelRef}
          style={panelStyle}
          className="bg-white border border-zinc-200 rounded-xl shadow-lg p-3 min-w-[220px] max-w-[330px] text-sm"
        >
          {flag.substitute_applied && flag.original_display ? (
            <>
              <p className="text-zinc-600 mb-2">
                {t('recipes.originally')}{' '}
                <strong className="text-zinc-800">
                  {flag.original_display}
                </strong>
                , {t('recipes.replacedWith')}{' '}
                <strong className="text-zinc-800">{flag.substitute}</strong>{' '}
                {t('recipes.dueTo')} {flag.allergen}.
              </p>
              <Button
                size="sm"
                variant="secondary"
                onPress={handleRestoreClick}
              >
                {t('recipes.restoreOriginal')}
              </Button>
            </>
          ) : flag.substitute ? (
            <>
              <p className="text-zinc-600 mb-2">
                {t('recipes.contains')}{' '}
                <strong className="text-zinc-800">{flag.allergen}</strong>.{' '}
                {t('recipes.suggestedSubstitute')}{' '}
                <strong className="text-zinc-800">{flag.substitute}</strong>.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  onPress={handleReplaceClick}
                >
                  {t('recipes.replace')}
                </Button>
                <Button
                  size="sm"
                  variant="tertiary"
                  onPress={() => setOpen(false)}
                >
                  {t('recipes.keepOriginal')}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-zinc-600">
              {t('recipes.contains')}{' '}
              <strong className="text-zinc-800">{flag.allergen}</strong>.{' '}
              {t('recipes.noSubstituteAvailable')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default AllergenPopover
