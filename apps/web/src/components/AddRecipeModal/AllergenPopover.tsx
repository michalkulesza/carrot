import { useCallback, useEffect, useRef, useState } from 'react'
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
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)

    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const handleReplaceClick = useCallback(() => {
    onReplace()
    setOpen(false)
  }, [onReplace])

  const handleRestoreClick = useCallback(() => {
    onRestore()
    setOpen(false)
  }, [onRestore])

  const handleKeepOriginalClick = useCallback(() => setOpen(false), [])

  const isActive =
    flag.allergen &&
    activeAllergens.some((a) => {
      const fa = flag.allergen!.toLowerCase()
      const la = a.toLowerCase()

      return fa === la || fa.includes(la) || la.includes(fa)
    })
  if (!isActive) return null

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 text-xs font-medium whitespace-nowrap"
        title={t('recipes.contains') + ' ' + flag.allergen}
      >
        ⚠ {flag.allergen}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-zinc-200 rounded-xl shadow-lg p-3 min-w-[220px] text-sm">
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
                  onPress={handleKeepOriginalClick}
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
