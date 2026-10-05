import { useEffect, useRef, useState } from 'react'
import { Search } from 'react-feather'
import { useTranslation } from 'react-i18next'
import {
  Modal,
  ModalBackdrop,
  ModalContainer,
  ModalDialog,
  toast,
} from '@heroui/react'
import type { ImportJob, RecipeOut } from '@carrot/shared/types'
import {
  enqueueImportJob,
  listMyRecipes,
  setRecipeHouseholds,
} from '../../api/client'
import { useHousehold } from '../../context/HouseholdContext'
import { proxyUrl } from '../../utils/imageUtils'
import NetworkImage from '../NetworkImage'
import ImportRecipeBody from './ImportRecipeBody'
import type { ImportMode } from './importSources'

interface AddRecipeModalProps {
  isOpen: boolean
  initialImportMode?: ImportMode
  onClose: () => void
  onSaved?: () => void
  onImportEnqueued: (job: ImportJob) => void
  onImportModeChange?: (mode: ImportMode) => void
}

const AddRecipeModal = ({
  isOpen,
  initialImportMode = 'url',
  onClose,
  onSaved,
  onImportEnqueued,
  onImportModeChange,
}: AddRecipeModalProps) => {
  const { t } = useTranslation()
  const { activeHouseholdId } = useHousehold()
  const [importMode, setImportMode] = useState<ImportMode>('url')
  const [url, setUrl] = useState('')
  const [pastedText, setPastedText] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const submittingRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [myRecipes, setMyRecipes] = useState<RecipeOut[]>([])
  const [librarySearch, setLibrarySearch] = useState('')
  const [linking, setLinking] = useState(false)

  useEffect(() => {
    if (isOpen) setImportMode(initialImportMode)
  }, [initialImportMode, isOpen])

  useEffect(() => {
    if (isOpen) {
      listMyRecipes()
        .then(setMyRecipes)
        .catch(() => {})
    }
  }, [isOpen])

  useEffect(() => {
    if (!photo) {
      setPhotoPreview(null)

      return
    }
    const objectUrl = URL.createObjectURL(photo)
    setPhotoPreview(objectUrl)

    return () => URL.revokeObjectURL(objectUrl)
  }, [photo])

  const reset = () => {
    setImportMode('url')
    setUrl('')
    setPastedText('')
    setPhoto(null)
    setLoading(false)
    submittingRef.current = false
    setError(null)
    setLibrarySearch('')
  }

  async function handleLink(recipe: RecipeOut) {
    if (!activeHouseholdId || linking) return
    setLinking(true)
    setError(null)
    try {
      const householdIds = Array.from(
        new Set([...recipe.household_ids, activeHouseholdId])
      )
      await setRecipeHouseholds(recipe.id, householdIds)
      toast.success(t('addRecipe.recipeAddedToHousehold'), { timeout: 3000 })
      onSaved?.()
      reset()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('addRecipe.failedToAdd'))
    } finally {
      setLinking(false)
    }
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const readClipboard = async () => {
    try {
      return (await navigator.clipboard.readText()).trim()
    } catch {
      return null /* permission denied */
    }
  }

  const handlePasteUrl = async () => {
    const text = await readClipboard()
    if (text !== null) setUrl(text)
  }

  const handlePasteText = async () => {
    const text = await readClipboard()
    if (text !== null) setPastedText(text)
  }

  const enqueue = async (kind: ImportMode, input: Record<string, string>) => {
    if (submittingRef.current) return
    submittingRef.current = true
    setLoading(true)
    setError(null)
    try {
      const job = await enqueueImportJob({
        kind,
        input,
        idempotency_key: crypto.randomUUID(),
      })
      onImportEnqueued(job)
      toast.success(t('importJobs.queued'), { timeout: 3000 })
      reset()
      onClose()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('importJobs.enqueueFailed')
      )
      submittingRef.current = false
      setLoading(false)
    }
  }

  const enqueuePhoto = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      void enqueue('image', {
        image_base64: dataUrl.slice(dataUrl.indexOf(',') + 1),
        mime_type: file.type || 'image/jpeg',
      })
    }
    reader.readAsDataURL(file)
  }

  const canSubmit =
    importMode === 'url'
      ? url.trim().length > 0
      : importMode === 'text'
        ? pastedText.trim().length > 0
        : photo !== null

  const handleSubmit = () => {
    if (importMode === 'url') void enqueue('url', { url: url.trim() })
    else if (importMode === 'text')
      void enqueue('text', { text: pastedText.trim() })
    else if (photo) enqueuePhoto(photo)
  }

  const handleModeChange = (mode: ImportMode) => {
    setImportMode(mode)
    onImportModeChange?.(mode)
  }

  const unlinkedRecipes = myRecipes.filter(
    (r) => !activeHouseholdId || !r.household_ids.includes(activeHouseholdId)
  )
  const filteredPersonalRecipes = unlinkedRecipes.filter((r) =>
    r.title.toLowerCase().includes(librarySearch.toLowerCase())
  )

  const handleModalOpenChange = (open: boolean) => {
    if (!open) handleClose()
  }

  const libraryContent =
    unlinkedRecipes.length > 0 ? (
      <div className="flex flex-col gap-2 border-t border-[#ECEAF0] pt-4">
        <p className="text-xs font-bold uppercase tracking-[0.07em] text-[#8C8A99]">
          {t('addRecipe.fromPersonalLibrary')}
        </p>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 shrink-0 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder={t('recipes.searchPlaceholder')}
            value={librarySearch}
            onChange={(e) => setLibrarySearch(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 py-1.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <ul className="flex max-h-44 flex-col gap-0.5 overflow-y-auto">
          {filteredPersonalRecipes.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                disabled={linking}
                onClick={() => handleLink(r)}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-zinc-100 disabled:opacity-50"
              >
                <div className="flex min-w-0 items-center gap-2">
                  {r.thumbnail_url && (
                    <NetworkImage
                      src={proxyUrl(r.thumbnail_url)!}
                      alt=""
                      className="h-8 w-8 shrink-0 rounded"
                    />
                  )}
                  <span className="truncate font-medium">{r.title}</span>
                </div>
                <span className="shrink-0 text-xs font-semibold text-primary">
                  {t('common.add')}
                </span>
              </button>
            </li>
          ))}
          {filteredPersonalRecipes.length === 0 && (
            <li className="px-3 py-2 text-sm text-zinc-400">
              {t('recipes.noResults')}
            </li>
          )}
        </ul>
      </div>
    ) : null

  return (
    <Modal isOpen={isOpen} onOpenChange={handleModalOpenChange}>
      <ModalBackdrop isDismissable>
        <ModalContainer
          size="lg"
          scroll="inside"
          className="!rounded-none overflow-hidden sm:!rounded-3xl"
        >
          <ModalDialog
            aria-label={t('addRecipe.importRecipe')}
            className="relative flex !h-dvh !max-h-none !w-screen !max-w-none flex-col !rounded-none !p-0 sm:!h-auto sm:!max-h-[calc(100dvh-2rem)] sm:!w-[640px] sm:!max-w-[640px] sm:!rounded-3xl"
          >
            <ImportRecipeBody
              mode={importMode}
              onModeChange={handleModeChange}
              url={url}
              onUrlChange={setUrl}
              onPasteUrl={handlePasteUrl}
              text={pastedText}
              onTextChange={setPastedText}
              onPasteText={handlePasteText}
              photo={photo}
              photoPreview={photoPreview}
              onPhotoChange={setPhoto}
              loading={loading}
              canSubmit={canSubmit}
              error={error}
              onSubmit={handleSubmit}
              onClose={handleClose}
              libraryContent={libraryContent}
            />
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  )
}

export default AddRecipeModal
