import { AnimatePresence } from 'framer-motion'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useLinkedRecipeImport } from '@carrot/shared/hooks/useLinkedRecipeImport'
import type { LinkedRecipeImportResult } from '@carrot/shared/types'
import PopupSurface from '../PopupSurface'

interface UnresolvedLinkMenuProps {
  url: string
  parentRecipeId: string
  onOpenRecipe?: (id: string) => void
  className: string
  children: ReactNode
}

const MENU_ITEM_CLASS_NAME =
  'block w-full px-3 py-2 text-left text-sm text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50'

const UnresolvedLinkMenu = ({
  url,
  parentRecipeId,
  onOpenRecipe,
  className,
  children,
}: UnresolvedLinkMenuProps) => {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const [queued, setQueued] = useState(false)
  const linkedImport = useLinkedRecipeImport(parentRecipeId)
  const busy = linkedImport.isPending || queued

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const handleToggle = useCallback(() => setOpen((current) => !current), [])

  const handleImportSuccess = useCallback(
    (result: LinkedRecipeImportResult) => {
      if (result.recipe_id) onOpenRecipe?.(result.recipe_id)
      else setQueued(true)
    },
    [onOpenRecipe]
  )

  const handleImport = useCallback(() => {
    setOpen(false)
    if (busy) return
    linkedImport.mutate(url, { onSuccess: handleImportSuccess })
  }, [busy, linkedImport, url, handleImportSuccess])

  const handleOpenWebsite = useCallback(() => {
    setOpen(false)
    window.open(url, '_blank', 'noopener,noreferrer')
  }, [url])

  const importLabel = t('recipes.importLinkedRecipe')
  const websiteLabel = t('recipes.openLinkedWebsite')

  if (queued)
    return <span className={className}>{t('recipes.linkedImportQueued')}</span>

  return (
    <span ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={handleToggle}
        disabled={linkedImport.isPending}
        aria-haspopup="menu"
        aria-expanded={open}
        className={className}
      >
        {children}
      </button>
      {linkedImport.isError && (
        <span role="alert" className="ml-2 text-xs text-red-600">
          {t('recipes.linkedImportFailed')}
        </span>
      )}
      <AnimatePresence>
        {open && (
          <PopupSurface
            role="menu"
            className="absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              onClick={handleImport}
              aria-label={importLabel}
              className={MENU_ITEM_CLASS_NAME}
              autoFocus
            >
              {importLabel}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={handleOpenWebsite}
              aria-label={websiteLabel}
              className={MENU_ITEM_CLASS_NAME}
            >
              {websiteLabel}
            </button>
          </PopupSurface>
        )}
      </AnimatePresence>
    </span>
  )
}

export default UnresolvedLinkMenu
