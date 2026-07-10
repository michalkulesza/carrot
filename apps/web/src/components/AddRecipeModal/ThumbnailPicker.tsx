import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { uploadThumbnail } from '../../api/client'
import { proxyUrl } from '../../utils/imageUtils'

interface ThumbnailPickerProps {
  recipeId: string
  thumbnailUrl: string | null
  onUploaded: (url: string) => void
}

const ThumbnailPicker = ({
  recipeId,
  thumbnailUrl,
  onUploaded,
}: ThumbnailPickerProps) => {
  const { t } = useTranslation()
  const [imgUploading, setImgUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      setImgUploading(true)
      try {
        const result = await uploadThumbnail(file, recipeId)
        onUploaded(result.url)
      } catch {
        // keep existing thumbnail on failure
      } finally {
        setImgUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    },
    [recipeId, onUploaded]
  )

  const handlePickClick = useCallback(() => fileInputRef.current?.click(), [])

  const proxied = proxyUrl(thumbnailUrl)

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      <button
        type="button"
        onClick={handlePickClick}
        disabled={imgUploading}
        className="relative w-16 h-16 rounded-lg shrink-0 overflow-hidden bg-zinc-100 group cursor-pointer disabled:opacity-60"
        aria-label={t('common.changePhoto')}
      >
        {proxied ? (
          <img
            src={proxied}
            alt="thumbnail"
            className="w-full h-full object-cover"
            onError={(e) => {
              ;(e.target as HTMLImageElement).style.display = 'none'
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-300 text-2xl">
            🖼
          </div>
        )}
        <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <span className="text-white text-[10px] font-semibold uppercase tracking-wide">
            {imgUploading ? t('common.uploading') : t('common.edit')}
          </span>
        </div>
      </button>
    </>
  )
}

export default ThumbnailPicker
