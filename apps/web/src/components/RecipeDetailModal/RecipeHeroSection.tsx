import { useCallback, useState, type ChangeEvent, type RefObject } from 'react'
import {
  Calendar,
  Edit2,
  Link,
  Share2,
  ShoppingCart,
  Star,
  Trash2,
} from 'react-feather'
import { useTranslation } from 'react-i18next'
import type { RecipeOut, Tag } from '@carrot/shared/types'
import { proxyUrl, PLACEHOLDER_URL } from '../../utils/imageUtils'
import NetworkImage from '../NetworkImage'
import TagRow from '../TagRow'
import AllergenBadges from './AllergenBadges'
import {
  getHeaderBg,
  getRecipeAllergens,
  type EditState,
  type Mode,
} from './helpers'
import EditLine from './EditLine'
import { createPublicShare } from '../../api/client'

interface RecipeHeroSectionProps {
  recipe: RecipeOut
  draft: EditState
  mode: Mode
  onTitleChange: (v: string) => void
  localTags: Tag[]
  allTags: Tag[]
  onTagAdd: (tag: Tag) => void
  onTagRemove: (tagId: string) => void
  onTagCreate: (name: string) => Promise<Tag>
  fileInputRef: RefObject<HTMLInputElement | null>
  onThumbnailFile: (e: ChangeEvent<HTMLInputElement>) => void
  imgUploading: boolean
  addMode: boolean
  onToggleAddMode: () => void
  onOpenMealPlan: () => void
  onToggleFavourite: () => void
  onEdit: () => void
  onDelete: () => void
}

const RecipeHeroSection = ({
  recipe,
  draft,
  mode,
  onTitleChange,
  localTags,
  allTags,
  onTagAdd,
  onTagRemove,
  onTagCreate,
  fileInputRef,
  onThumbnailFile,
  imgUploading,
  addMode,
  onToggleAddMode,
  onOpenMealPlan,
  onToggleFavourite,
  onEdit,
  onDelete,
}: RecipeHeroSectionProps) => {
  const { t } = useTranslation()
  const r = recipe
  const displayThumb =
    mode === 'editing' ? draft.thumbnail_url : r.thumbnail_url
  const proxied = proxyUrl(displayThumb)
  const headerBg = getHeaderBg(mode)
  const allergens = getRecipeAllergens(r)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [shareExpiry, setShareExpiry] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)

  const handleCreateShare = useCallback(async () => {
    if (sharing) return
    setSharing(true)
    setShareError(null)
    try {
      const share = await createPublicShare(r.id)
      setShareUrl(share.url)
      setShareExpiry(share.expires_at)
      if (navigator.share) await navigator.share({ title: r.title, url: share.url })
      else await navigator.clipboard.writeText(share.url)
    } catch (error) {
      setShareError(error instanceof Error ? error.message : t('publicShare.createError'))
    } finally {
      setSharing(false)
    }
  }, [r.id, r.title, sharing, t])

  const handleCopyShare = useCallback(async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
    } catch {
      setShareError(t('publicShare.copyError'))
    }
  }, [shareUrl, t])

  const tagRow = (
    <div className="mt-2">
      <TagRow
        tags={localTags}
        allTags={allTags}
        onAdd={onTagAdd}
        onRemove={onTagRemove}
        onCreateTag={onTagCreate}
        editable={mode === 'editing'}
        addable
      />
    </div>
  )

  const toolbar = mode === 'view' && (
    <div className="absolute top-3 right-3 flex gap-1 z-10">
      <button
        type="button"
        onClick={() => setShareOpen(true)}
        aria-label={t('publicShare.open')}
        className="w-8 h-8 flex items-center justify-center rounded-full bg-white/90 text-zinc-600 hover:bg-white shadow-sm transition-colors"
      >
        <Share2 className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={onToggleAddMode}
        aria-label={t('shoppingList.addToList')}
        aria-pressed={addMode}
        className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
          addMode
            ? 'bg-primary text-primary-foreground'
            : 'bg-white/90 text-zinc-600 hover:bg-white shadow-sm'
        }`}
      >
        <ShoppingCart className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={onOpenMealPlan}
        aria-label={t('mealPlan.addToMealPlan')}
        className="w-8 h-8 flex items-center justify-center rounded-full bg-white/90 text-zinc-600 hover:bg-white shadow-sm transition-colors"
      >
        <Calendar className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={onEdit}
        aria-label={t('common.edit')}
        className="w-8 h-8 flex items-center justify-center rounded-full bg-white/90 text-zinc-600 hover:bg-white shadow-sm transition-colors"
      >
        <Edit2 className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={t('recipes.remove')}
        className="w-8 h-8 flex items-center justify-center rounded-full bg-white/90 text-danger hover:bg-danger-50 shadow-sm transition-colors"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  )

  return (
    <div className={`relative ${headerBg}`}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onThumbnailFile}
      />

      {proxied && (
        <NetworkImage
          src={proxied}
          alt={r.title}
          className="w-full h-64 object-cover"
          onError={(e) => {
            if (PLACEHOLDER_URL)
              (e.target as HTMLImageElement).src = PLACEHOLDER_URL
          }}
        />
      )}

      {toolbar}

      {shareOpen && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={t('publicShare.title')}>
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold">{t('publicShare.title')}</h3>
            <p className="mt-2 text-sm text-zinc-600">{t('publicShare.description')}</p>
            {shareError && <p className="mt-3 text-sm text-danger">{shareError}</p>}
            {shareUrl && <input readOnly value={shareUrl} aria-label={t('publicShare.link')} className="mt-3 w-full rounded border p-2 text-xs" />}
            {shareExpiry && <p className="mt-2 text-xs text-zinc-500">{t('publicShare.expires', { date: new Date(shareExpiry).toLocaleDateString() })}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShareOpen(false)} className="rounded px-3 py-2 text-sm">{t('common.close')}</button>
              {shareUrl && !navigator.share ? <button type="button" onClick={handleCopyShare} className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground">{t('publicShare.copy')}</button> : <button type="button" disabled={sharing} onClick={handleCreateShare} className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-60">{sharing ? t('common.loading') : t('publicShare.share')}</button>}
            </div>
          </div>
        </div>
      )}

      {mode === 'editing' && proxied && (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={imgUploading}
          className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/40 text-white text-xs font-semibold hover:bg-black/60 transition-colors backdrop-blur-sm disabled:opacity-60"
        >
          {imgUploading ? t('common.uploading') : t('common.changePhoto')}
        </button>
      )}

      <div className={`px-10 pb-1 ${proxied ? 'pt-5' : 'pt-14'}`}>
        <div className="flex items-start gap-2">
          {mode === 'view' && (
            <button
              type="button"
              onClick={onToggleFavourite}
              aria-label={
                r.is_favourite
                  ? t('recipes.removeFromFavourites')
                  : t('recipes.addToFavourites')
              }
              className={`mt-0.5 shrink-0 p-1 transition-colors ${
                r.is_favourite
                  ? 'text-amber-400'
                  : 'text-zinc-300 hover:text-amber-400'
              }`}
            >
              <Star
                className="w-6 h-6"
                fill={r.is_favourite ? 'currentColor' : 'none'}
              />
            </button>
          )}
          {mode === 'editing' ? (
            <EditLine
              value={draft.title}
              onChange={onTitleChange}
              className="flex-1 text-2xl font-bold leading-snug"
              multiline
            />
          ) : r.source_url ? (
            <a
              href={r.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-1.5 text-2xl font-bold leading-snug text-zinc-900 hover:text-primary transition-colors"
            >
              <span>{r.title}</span>
              <Link className="mt-1.5 h-4 w-4 shrink-0" aria-hidden="true" />
            </a>
          ) : (
            <h2 className="text-2xl font-bold leading-snug">{r.title}</h2>
          )}
        </div>
        {tagRow}
        {mode === 'view' && <AllergenBadges allergens={allergens} />}
      </div>

      {mode === 'editing' && !proxied && (
        <div className="px-10 pt-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={imgUploading}
            className="text-sm text-primary underline disabled:opacity-60"
          >
            {imgUploading ? t('common.uploading') : t('common.addPhoto')}
          </button>
        </div>
      )}
    </div>
  )
}

export default RecipeHeroSection
