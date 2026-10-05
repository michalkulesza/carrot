import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { CloseIcon, SourceIcon, UploadIcon } from './ImportIcons'

interface ImportPhotoPanelProps {
  photo: File | null
  photoPreview: string | null
  onPhotoChange: (file: File | null) => void
}

const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif'

const ImportPhotoPanel = ({
  photo,
  photoPreview,
  onPhotoChange,
}: ImportPhotoPanelProps) => {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0]
    if (file) onPhotoChange(file)
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(event) => {
          handleFiles(event.target.files)
          event.target.value = ''
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          handleFiles(event.target.files)
          event.target.value = ''
        }}
      />
      {photo && photoPreview ? (
        <div className="flex items-center gap-4 rounded-[18px] border-[1.5px] border-[#E4DFF7] bg-[#FBFAFE] p-4">
          <div className="relative aspect-[3/4] w-[88px] shrink-0 overflow-hidden rounded-[10px] border-[1.5px] border-[#E4DFF7]">
            <img
              src={photoPreview}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
          <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#3B2F8C]">
            {photo.name}
          </span>
          <button
            type="button"
            onClick={() => onPhotoChange(null)}
            aria-label={t('addRecipe.removePhoto')}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(31,29,43,0.7)] text-white"
          >
            <CloseIcon size={12} strokeWidth={3} />
          </button>
        </div>
      ) : (
        <>
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                fileInputRef.current?.click()
              }
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              handleFiles(event.dataTransfer.files)
            }}
            className="hidden cursor-pointer flex-col items-center gap-3.5 rounded-[18px] border-2 border-dashed border-[#C9C0F0] bg-[#FBFAFE] px-5 py-7 text-center hover:border-[#7C6AE0] hover:bg-[#F6F4FE] sm:flex"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEEAFE] text-[#7C6AE0]">
              <UploadIcon />
            </span>
            <span className="flex flex-col gap-1">
              <span className="text-[17px] font-extrabold text-[#3B2F8C]">
                {t('addRecipe.dropPhoto')}
              </span>
              <span className="text-sm text-[#6B6A78]">
                {t('addRecipe.dropFormats')}
              </span>
            </span>
            <span className="flex gap-2">
              <span className="flex items-center gap-1.5 rounded-xl bg-[#7C6AE0] px-4 py-2.5 text-sm font-extrabold text-white">
                {t('addRecipe.chooseFile')}
              </span>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  cameraInputRef.current?.click()
                }}
                className="flex items-center gap-1.5 rounded-xl border-[1.5px] border-[#C9C0F0] bg-white px-4 py-2.5 text-sm font-extrabold text-[#5B4BC4]"
              >
                {t('addRecipe.takePhoto')}
              </button>
            </span>
          </div>
          <div className="flex flex-col gap-2.5 sm:hidden">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="flex h-[150px] flex-col items-center justify-center gap-2.5 rounded-[18px] bg-[#7C6AE0] text-lg font-extrabold text-white"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20">
                <SourceIcon mode="image" />
              </span>
              {t('addRecipe.takePhoto')}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-[52px] items-center justify-center rounded-[14px] border-[1.5px] border-[#C9C0F0] bg-[#FBFAFE] text-base font-extrabold text-[#5B4BC4]"
            >
              {t('addRecipe.chooseFile')}
            </button>
          </div>
          <div className="flex flex-col gap-2 px-0.5 py-1.5 sm:grid sm:grid-cols-3 sm:gap-2 sm:p-0">
            {[
              ['☀', t('addRecipe.tipLight')],
              ['▢', t('addRecipe.tipFrame')],
              ['✎', t('addRecipe.tipHandwriting')],
            ].map(([icon, label]) => (
              <div
                key={label}
                className="flex items-center gap-2.5 text-sm font-bold text-[#4A4858] sm:gap-2 sm:text-[13px]"
              >
                <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[#EEEAFE] text-xs text-[#5B4BC4] sm:h-6 sm:w-6">
                  {icon}
                </span>
                {label}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default ImportPhotoPanel
