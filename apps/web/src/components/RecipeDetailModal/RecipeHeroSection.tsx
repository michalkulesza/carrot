import type { ChangeEvent, RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import type { RecipeOut, Tag } from '@carrot/shared/types'
import { proxyUrl, PLACEHOLDER_URL } from '../../utils/imageUtils'
import TagRow from '../TagRow'
import { getHeaderBg, type EditState, type Mode } from './helpers'
import EditLine from './EditLine'
import HeaderActionButtons from './HeaderActionButtons'

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
  onEdit,
  onDelete,
}: RecipeHeroSectionProps) => {
  const { t } = useTranslation()
  const r = recipe
  const displayThumb =
    mode === 'editing' ? draft.thumbnail_url : r.thumbnail_url
  const proxied = proxyUrl(displayThumb)
  const headerBg = getHeaderBg(mode)

  const tagRow = (
    <div className="mt-1.5">
      <TagRow
        tags={localTags}
        allTags={allTags}
        onAdd={onTagAdd}
        onRemove={onTagRemove}
        onCreateTag={onTagCreate}
        editable={mode === 'editing'}
      />
    </div>
  )

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onThumbnailFile}
      />

      {proxied ? (
        <div className="relative w-full h-64 shrink-0">
          <img
            src={proxied}
            alt={r.title}
            className="absolute inset-0 w-full h-full object-cover"
            onError={(e) => {
              if (PLACEHOLDER_URL)
                (e.target as HTMLImageElement).src = PLACEHOLDER_URL
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />

          {mode === 'view' && (
            <HeaderActionButtons
              variant="overlay"
              onEdit={onEdit}
              onDelete={onDelete}
            />
          )}

          {mode === 'editing' && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={imgUploading}
              className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/40 text-white text-xs font-semibold hover:bg-black/60 transition-colors backdrop-blur-sm disabled:opacity-60"
            >
              {imgUploading ? t('common.uploading') : t('common.changePhoto')}
            </button>
          )}

          <div className="absolute bottom-0 inset-x-0 px-5 pb-4 pt-8">
            {mode === 'editing' ? (
              <EditLine
                value={draft.title}
                onChange={onTitleChange}
                className="text-xl font-bold text-white leading-snug placeholder:text-white/50"
                multiline
              />
            ) : (
              <h2 className="text-xl font-bold text-white leading-snug">
                {r.title}
              </h2>
            )}
            {tagRow}
            {(r.creator_handle || r.source_url) && (
              <p className="text-sm text-white/75 mt-1">
                {r.creator_handle && <span>@{r.creator_handle}</span>}
                {r.creator_handle && r.source_url && <span> · </span>}
                {r.source_url && (
                  <a
                    href={r.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-white"
                  >
                    {t('recipes.source')}
                  </a>
                )}
              </p>
            )}
            {r.household_id && r.added_by && (
              <p className="text-xs text-white/60 mt-0.5">
                Added by {r.added_by}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div
          className={`relative px-5 pt-5 pb-1 ${mode === 'view' ? 'pr-20' : ''} ${headerBg}`}
        >
          {mode === 'view' && (
            <HeaderActionButtons
              variant="light"
              onEdit={onEdit}
              onDelete={onDelete}
            />
          )}
          {mode === 'editing' ? (
            <EditLine
              value={draft.title}
              onChange={onTitleChange}
              className="text-xl font-bold leading-snug"
              multiline
            />
          ) : (
            <h2 className="text-xl font-bold leading-snug">{r.title}</h2>
          )}
          {tagRow}
          {(r.creator_handle || r.source_url) && (
            <p className="text-sm text-zinc-500 mt-1">
              {r.creator_handle && <span>@{r.creator_handle}</span>}
              {r.creator_handle && r.source_url && <span> · </span>}
              {r.source_url && (
                <a
                  href={r.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-primary hover:text-primary-600"
                >
                  {t('recipes.source')}
                </a>
              )}
            </p>
          )}
          {r.household_id && r.added_by && (
            <p className="text-xs text-zinc-400 mt-0.5">
              Added by {r.added_by}
            </p>
          )}
        </div>
      )}

      {mode === 'editing' && !proxied && (
        <div className={`px-5 pt-2 ${headerBg}`}>
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
    </>
  )
}

export default RecipeHeroSection
