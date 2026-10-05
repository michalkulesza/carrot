import { useState, type ChangeEvent, type RefObject } from 'react'
import {
  Calendar,
  Edit2,
  Link,
  Share2,
  ShoppingCart,
  Star,
} from 'react-feather'
import { useTranslation } from 'react-i18next'
import type { RecipeOut, Tag } from '@carrot/shared/types'
import { proxyUrl } from '../../utils/imageUtils'
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
import ShareRecipeDialog from './ShareRecipeDialog'

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
  readOnly?: boolean
  part?: 'all' | 'image' | 'details'
  renderFileInput?: boolean
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
  readOnly = false,
  part = 'all',
  renderFileInput = true,
}: RecipeHeroSectionProps) => {
  const { t } = useTranslation()
  const r = recipe
  const displayThumb =
    mode === 'editing' ? draft.thumbnail_url : r.thumbnail_url
  const proxied = proxyUrl(displayThumb)
  const headerBg = getHeaderBg(mode)
  const allergens = getRecipeAllergens(r)
  const [shareOpen, setShareOpen] = useState(false)

  const tagRow = (
    <div className="mt-2">
      <TagRow
        tags={localTags}
        allTags={allTags}
        onAdd={onTagAdd}
        onRemove={onTagRemove}
        onCreateTag={onTagCreate}
        editable={mode === 'editing'}
        addable={!readOnly}
      />
    </div>
  )

  const desktopToolbar = part === 'details'
  const toolbar = !readOnly && mode === 'view' && part !== 'image' && (
    <div
      className={
        desktopToolbar
          ? 'mt-4 flex flex-wrap gap-2'
          : 'absolute top-3 right-3 z-10 flex gap-1'
      }
    >
      <button
        type="button"
        onClick={() => setShareOpen(true)}
        aria-label={t('publicShare.open')}
        className={
          desktopToolbar
            ? 'inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm text-zinc-700 hover:bg-zinc-50'
            : 'w-8 h-8 flex items-center justify-center rounded-full bg-white/90 text-zinc-600 hover:bg-white shadow-sm transition-colors'
        }
      >
        <Share2 className="w-4 h-4" />
        {desktopToolbar && t('publicShare.open')}
      </button>
      <button
        type="button"
        onClick={onToggleAddMode}
        aria-label={t('shoppingList.addToList')}
        aria-pressed={addMode}
        className={`${desktopToolbar ? 'inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm' : 'w-8 h-8 flex items-center justify-center rounded-full'} transition-colors ${
          addMode
            ? 'bg-primary text-primary-foreground'
            : desktopToolbar
              ? 'text-zinc-700 hover:bg-zinc-50'
              : 'bg-white/90 text-zinc-600 hover:bg-white shadow-sm'
        }`}
      >
        <ShoppingCart className="w-4 h-4" />
        {desktopToolbar && t('shoppingList.addToList')}
      </button>
      <button
        type="button"
        onClick={onOpenMealPlan}
        aria-label={t('mealPlan.addToMealPlan')}
        className={
          desktopToolbar
            ? 'inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm text-zinc-700 hover:bg-zinc-50'
            : 'w-8 h-8 flex items-center justify-center rounded-full bg-white/90 text-zinc-600 hover:bg-white shadow-sm transition-colors'
        }
      >
        <Calendar className="w-4 h-4" />
        {desktopToolbar && t('mealPlan.addToMealPlan')}
      </button>
      <button
        type="button"
        onClick={onEdit}
        aria-label={t('common.edit')}
        className={
          desktopToolbar
            ? 'inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm text-zinc-700 hover:bg-zinc-50'
            : 'w-8 h-8 flex items-center justify-center rounded-full bg-white/90 text-zinc-600 hover:bg-white shadow-sm transition-colors'
        }
      >
        <Edit2 className="w-4 h-4" />
        {desktopToolbar && t('common.edit')}
      </button>
    </div>
  )

  return (
    <div className={`relative ${headerBg}`}>
      {(part !== 'details' || shareOpen) && (
        <div className="relative">
          {renderFileInput && (
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onThumbnailFile}
            />
          )}

          {part !== 'details' && proxied && (
            <NetworkImage
              src={proxied}
              alt={r.title}
              className="w-full h-64 object-cover"
            />
          )}

          {!proxied && part === 'image' && (
            <div className="h-28 bg-zinc-100" aria-hidden="true" />
          )}

          {part === 'all' && toolbar}

          <ShareRecipeDialog
            recipe={r}
            open={shareOpen}
            onClose={() => setShareOpen(false)}
          />

          {part === 'all' && mode === 'editing' && proxied && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={imgUploading}
              className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/40 text-white text-xs font-semibold hover:bg-black/60 transition-colors backdrop-blur-sm disabled:opacity-60"
            >
              {imgUploading ? t('common.uploading') : t('common.changePhoto')}
            </button>
          )}
        </div>
      )}

      {part !== 'image' && (
        <div
          className={`${readOnly ? 'mx-auto max-w-[800px]' : ''} ${part === 'details' ? 'px-6 sm:px-10 lg:px-0' : 'px-10'} pb-1 ${proxied || part === 'details' ? 'pt-5' : 'pt-14'}`}
        >
          <div className="flex items-start gap-2">
            {!readOnly && mode === 'view' && (
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
          {desktopToolbar && toolbar}
        </div>
      )}

      {part !== 'image' && mode === 'editing' && !proxied && (
        <div
          className={`${part === 'details' ? 'px-6 sm:px-10 lg:px-0' : 'px-10'} pt-2`}
        >
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

      {part === 'details' && mode === 'editing' && proxied && (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={imgUploading}
          className="mt-2 text-sm text-primary underline disabled:opacity-60"
        >
          {imgUploading ? t('common.uploading') : t('common.changePhoto')}
        </button>
      )}
    </div>
  )
}

export default RecipeHeroSection
