import { useCallback, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import type { RecipeOut } from '@carrot/shared/types'
import { createPublicShare } from '../../api/client'
import PopupSurface from '../PopupSurface'

interface ShareRecipeDialogProps {
  recipe: RecipeOut
  open: boolean
  onClose: () => void
}

const ShareRecipeDialog = ({
  recipe,
  open,
  onClose,
}: ShareRecipeDialogProps) => {
  const { t } = useTranslation()
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [shareExpiry, setShareExpiry] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)

  const handleCreateShare = useCallback(async () => {
    if (sharing) return
    setSharing(true)
    setShareError(null)
    try {
      const share = await createPublicShare(recipe.id)
      setShareUrl(share.url)
      setShareExpiry(share.expires_at)
      if (navigator.share)
        await navigator.share({ title: recipe.title, url: share.url })
      else await navigator.clipboard.writeText(share.url)
    } catch (error) {
      setShareError(
        error instanceof Error ? error.message : t('publicShare.createError')
      )
    } finally {
      setSharing(false)
    }
  }, [recipe.id, recipe.title, sharing, t])

  const handleCopyShare = useCallback(async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
    } catch {
      setShareError(t('publicShare.copyError'))
    }
  }, [shareUrl, t])

  return (
    <AnimatePresence>
      {open && (
        <PopupSurface
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t('publicShare.title')}
        >
          <PopupSurface className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold">{t('publicShare.title')}</h3>
            <p className="mt-2 text-sm text-zinc-600">
              {t('publicShare.description')}
            </p>
            {shareError && (
              <p className="mt-3 text-sm text-danger">{shareError}</p>
            )}
            {shareUrl && (
              <input
                readOnly
                value={shareUrl}
                aria-label={t('publicShare.link')}
                className="mt-3 w-full rounded border p-2 text-xs"
              />
            )}
            {shareExpiry && (
              <p className="mt-2 text-xs text-zinc-500">
                {t('publicShare.expires', {
                  date: new Date(shareExpiry).toLocaleDateString(),
                })}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded px-3 py-2 text-sm"
              >
                {t('common.close')}
              </button>
              {shareUrl && !navigator.share ? (
                <button
                  type="button"
                  onClick={handleCopyShare}
                  className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground"
                >
                  {t('publicShare.copy')}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={sharing}
                  onClick={handleCreateShare}
                  className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-60"
                >
                  {sharing ? t('common.loading') : t('publicShare.share')}
                </button>
              )}
            </div>
          </PopupSurface>
        </PopupSurface>
      )}
    </AnimatePresence>
  )
}

export default ShareRecipeDialog
