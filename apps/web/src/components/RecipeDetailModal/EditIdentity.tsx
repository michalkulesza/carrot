import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import type { RecipeOut, Tag } from '@carrot/shared/types'
import { tTag } from '@carrot/shared/utils/tagUtils'
import { normalizeAllergenKey } from '../../pages/SettingsPage/helpers'
import { proxyUrl } from '../../utils/imageUtils'
import NetworkImage from '../NetworkImage'
import TagRow from '../TagRow'
import { getRecipeAllergens, type EditState } from './helpers'

interface EditIdentityProps {
  recipe: RecipeOut
  draft: EditState
  onTitleChange: (value: string) => void
  tags: Tag[]
  allTags: Tag[]
  onTagAdd: (tag: Tag) => void
  onTagRemove: (tagId: string) => void
  onTagCreate: (name: string) => Promise<Tag>
  fileInputRef: RefObject<HTMLInputElement | null>
  photoRef: RefObject<HTMLDivElement | null>
  imgUploading: boolean
  onRemovePhoto: () => void
}

const MAX_SUGGESTIONS = 3

const PHOTO_BUTTON =
  'flex items-center justify-center rounded-full bg-white/95 disabled:opacity-60'

const Trash = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </svg>
)

const Camera = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
)

const EditIdentity = ({
  recipe,
  draft,
  onTitleChange,
  tags,
  allTags,
  onTagAdd,
  onTagRemove,
  onTagCreate,
  fileInputRef,
  photoRef,
  imgUploading,
  onRemovePhoto,
}: EditIdentityProps) => {
  const { t } = useTranslation()
  const thumbnail = proxyUrl(draft.thumbnail_url)
  const attached = new Set(tags.map((tag) => tag.id))
  const suggestions = allTags
    .filter((tag) => !attached.has(tag.id))
    .slice(0, MAX_SUGGESTIONS)
  const allergens = getRecipeAllergens(recipe)
  const pickPhoto = () => fileInputRef.current?.click()

  return (
    <>
      <div
        ref={photoRef}
        className="relative h-[190px] shrink-0 overflow-hidden rounded-[18px] bg-[#EDE7E0] lg:h-[200px] lg:rounded-[14px]"
      >
        {thumbnail && (
          <NetworkImage
            src={thumbnail}
            alt={recipe.title}
            className="h-full w-full object-cover"
          />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[rgba(20,16,24,0)] from-50% to-[rgba(20,16,24,0.45)]" />
        <div className="absolute inset-x-2.5 bottom-2.5 flex gap-1.5">
          <button
            type="button"
            onClick={pickPhoto}
            disabled={imgUploading}
            className={`${PHOTO_BUTTON} h-11 gap-1.5 whitespace-nowrap px-4 text-sm font-extrabold lg:h-auto lg:px-3 lg:py-2 lg:text-[13px]`}
          >
            <Camera />
            {imgUploading
              ? t('common.uploading')
              : thumbnail
                ? t('common.changePhoto')
                : t('common.addPhoto')}
          </button>
          <div className="flex-1" />
          {thumbnail && (
            <button
              type="button"
              onClick={onRemovePhoto}
              aria-label={t('recipes.removePhoto')}
              className={`${PHOTO_BUTTON} h-11 w-11 text-[#A83434] lg:h-[34px] lg:w-[34px]`}
            >
              <Trash />
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {allergens.length > 0 && (
          <div className="flex flex-wrap gap-1.5 lg:-mb-1.5">
            {allergens.map((allergen) => (
              <span
                key={allergen}
                className="rounded-full bg-[#F1EFF5] px-[9px] py-[3px] text-xs font-bold text-[#8C8A99]"
              >
                ⚠{' '}
                {t(`allergens.${normalizeAllergenKey(allergen)}`, {
                  defaultValue: allergen,
                })}
              </span>
            ))}
          </div>
        )}
        <textarea
          value={draft.title}
          onChange={(event) => onTitleChange(event.target.value)}
          rows={2}
          placeholder={t('recipes.recipeNamePlaceholder')}
          aria-label={t('recipes.recipeNamePlaceholder')}
          className="resize-none rounded-xl border-[1.5px] border-[#ECEAF0] bg-white px-3 py-2.5 text-2xl font-extrabold leading-[1.2] text-[#1F1D2B] outline-none focus:border-[#E8894A] focus:ring-[3px] focus:ring-[#FDEFE4] lg:-mx-[9px] lg:rounded-[10px] lg:border-transparent lg:bg-transparent lg:px-2 lg:py-1.5 lg:hover:bg-[#F8F7FA] lg:focus:bg-white"
        />
        <TagRow
          tags={tags}
          allTags={allTags}
          onAdd={onTagAdd}
          onRemove={onTagRemove}
          onCreateTag={onTagCreate}
          editable
        />
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => onTagAdd(tag)}
                className="whitespace-nowrap rounded-full border border-dashed border-[#DDD9E4] px-3 py-1.5 text-sm font-bold text-[#8C8A99] hover:border-[#C9C0F0] hover:text-[#5B4BC4] lg:py-[3px] lg:text-[13px]"
              >
                + {tTag(tag.name, t)}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

export default EditIdentity
