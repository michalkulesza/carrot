import type { FormEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CloseIcon } from './ImportIcons'
import ImportLoadingState from './ImportLoadingState'
import ImportPhotoPanel from './ImportPhotoPanel'
import ImportSourceTabs from './ImportSourceTabs'
import ImportTextPanel from './ImportTextPanel'
import ImportUrlPanel from './ImportUrlPanel'
import type { ImportMode } from './importSources'

interface ImportRecipeBodyProps {
  mode: ImportMode
  onModeChange: (mode: ImportMode) => void
  url: string
  onUrlChange: (value: string) => void
  onPasteUrl: () => void
  text: string
  onTextChange: (value: string) => void
  onPasteText: () => void
  photo: File | null
  photoPreview: string | null
  onPhotoChange: (file: File | null) => void
  loading: boolean
  canSubmit: boolean
  error: string | null
  onSubmit: () => void
  onClose: () => void
  libraryContent?: ReactNode
}

const ImportRecipeBody = ({
  mode,
  onModeChange,
  url,
  onUrlChange,
  onPasteUrl,
  text,
  onTextChange,
  onPasteText,
  photo,
  photoPreview,
  onPhotoChange,
  loading,
  canSubmit,
  error,
  onSubmit,
  onClose,
  libraryContent,
}: ImportRecipeBodyProps) => {
  const { t } = useTranslation()

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (canSubmit && !loading) onSubmit()
  }

  return (
    <form
      id="import-form"
      onSubmit={handleSubmit}
      className="flex min-h-0 flex-1 flex-col font-['Nunito',system-ui,sans-serif] text-[#1F1D2B]"
    >
      <div className="flex items-center gap-2 px-5 pb-1.5 pt-1.5 sm:hidden">
        <span className="flex-1 text-[17px] font-extrabold">
          {t('addRecipe.importRecipe')}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F4F3F7] text-[#4A4858]"
        >
          <CloseIcon />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto px-5 pb-[120px] pt-2.5 [scrollbar-width:none] sm:p-7 sm:pb-3">
        <div className="flex items-start gap-3">
          <div className="flex flex-1 flex-col gap-1">
            <h2 className="text-[26px] font-extrabold leading-[1.15] sm:text-2xl sm:leading-normal">
              {t('addRecipe.whereFrom')}
            </h2>
            <p className="text-[15px] text-[#6B6A78]">
              <span className="sm:hidden">
                {t('addRecipe.whereFromHintShort')}
              </span>
              <span className="hidden sm:inline">
                {t('addRecipe.whereFromHint')}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="hidden h-9 w-9 items-center justify-center rounded-[10px] text-[#6B6A78] hover:bg-[#F4F3F7] sm:flex"
          >
            <CloseIcon strokeWidth={2} />
          </button>
        </div>

        {loading ? (
          <ImportLoadingState mode={mode} />
        ) : (
          <>
            <ImportSourceTabs mode={mode} onModeChange={onModeChange} />

            {mode === 'url' && (
              <ImportUrlPanel
                url={url}
                onUrlChange={onUrlChange}
                onPasteUrl={onPasteUrl}
              />
            )}

            {mode === 'image' && (
              <ImportPhotoPanel
                photo={photo}
                photoPreview={photoPreview}
                onPhotoChange={onPhotoChange}
              />
            )}

            {mode === 'text' && (
              <ImportTextPanel
                text={text}
                onTextChange={onTextChange}
                onPasteText={onPasteText}
              />
            )}

            {error && (
              <div className="rounded-lg bg-danger-50 p-3 text-sm text-danger">
                <strong>{t('addRecipe.importFailed')}</strong>
                <p className="mt-1">{error}</p>
              </div>
            )}
            {libraryContent}
          </>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-b from-white/0 to-white to-[24%] px-4 pb-[30px] pt-3 sm:static sm:flex sm:items-center sm:gap-2.5 sm:bg-none sm:px-7 sm:pb-7 sm:pt-0">
        <span className="hidden flex-1 sm:block" />
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className="hidden rounded-xl bg-[#F4F3F7] px-5 py-3 text-[15px] font-extrabold hover:bg-[#ECEAF0] disabled:opacity-60 sm:block"
        >
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          disabled={!canSubmit || loading}
          className="h-14 w-full whitespace-nowrap rounded-2xl text-[17px] font-extrabold text-white transition-colors sm:h-auto sm:w-auto sm:shrink-0 sm:rounded-xl sm:px-6 sm:py-3 sm:text-[15px]"
          style={{
            background: canSubmit && !loading ? '#E8894A' : '#F3C5A6',
            cursor: canSubmit && !loading ? 'pointer' : 'default',
          }}
        >
          {loading ? t('importJobs.running') : t('addRecipe.import')}
        </button>
      </div>
    </form>
  )
}

export default ImportRecipeBody
