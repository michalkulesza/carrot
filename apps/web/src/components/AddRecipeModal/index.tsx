import { FormEvent, useEffect, useRef, useState } from 'react'
import {
  Search,
  Link as LinkIcon,
  Type,
  Image as ImageIcon,
} from 'react-feather'
import { useTranslation } from 'react-i18next'
import {
  Modal,
  ModalBackdrop,
  ModalContainer,
  ModalDialog,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  toast,
} from '@heroui/react'
import type { ImportJob, RecipeOut } from '@carrot/shared/types'
import {
  enqueueImportJob,
  listPersonalRecipes,
  linkRecipeToHousehold,
} from '../../api/client'
import { useHousehold } from '../../context/HouseholdContext'
import { proxyUrl } from '../../utils/imageUtils'
import NetworkImage from '../NetworkImage'

const IMPORT_METHODS = [
  { key: 'url', labelKey: 'addRecipe.fromUrl', Icon: LinkIcon },
  { key: 'text', labelKey: 'addRecipe.fromText', Icon: Type },
  { key: 'image', labelKey: 'addRecipe.fromImage', Icon: ImageIcon },
] as const

const IMPORT_SOURCE_BADGES = [
  { label: 'Web', icon: '🌐' },
  { label: 'Instagram', icon: '📸' },
  { label: 'TikTok', icon: '🎵' },
]

interface AddRecipeModalProps {
  isOpen: boolean
  onClose: () => void
  onSaved?: () => void
  onImportEnqueued: (job: ImportJob) => void
}

const AddRecipeModal = ({
  isOpen,
  onClose,
  onSaved,
  onImportEnqueued,
}: AddRecipeModalProps) => {
  const { t } = useTranslation()
  const { activeHouseholdId } = useHousehold()
  const [importMode, setImportMode] = useState<'url' | 'text' | 'image'>('url')
  const [url, setUrl] = useState('')
  const [pastedText, setPastedText] = useState('')
  const importImageInputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [personalRecipes, setPersonalRecipes] = useState<RecipeOut[]>([])
  const [librarySearch, setLibrarySearch] = useState('')
  const [linking, setLinking] = useState(false)

  useEffect(() => {
    if (isOpen && activeHouseholdId) {
      listPersonalRecipes()
        .then(setPersonalRecipes)
        .catch(() => {})
    }
  }, [isOpen, activeHouseholdId])

  const reset = () => {
    setImportMode('url')
    setUrl('')
    setPastedText('')
    if (importImageInputRef.current) importImageInputRef.current.value = ''
    setLoading(false)
    setError(null)
    setLibrarySearch('')
  }

  async function handleLink(id: string) {
    setLinking(true)
    setError(null)
    try {
      await linkRecipeToHousehold(id)
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

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText()
      setUrl(text.trim())
    } catch {
      /* permission denied */
    }
  }

  const enqueue = async (kind: 'url' | 'text' | 'image', input: Record<string, string>) => {
    setLoading(true)
    setError(null)
    try {
      const job = await enqueueImportJob({ kind, input, idempotency_key: crypto.randomUUID() })
      onImportEnqueued(job)
      toast.success(t('importJobs.queued'), { timeout: 3000 })
      reset()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('importJobs.enqueueFailed'))
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (importMode === 'url') {
      void enqueue('url', { url: url.trim() })
    } else if (importMode === 'text') {
      void enqueue('text', { text: pastedText.trim() })
    }
  }

  const handleImageFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
      void enqueue('image', { image_base64: base64, mime_type: file.type || 'image/jpeg' })
    }
    reader.readAsDataURL(file)
  }

  const handleImportImageInputChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0]
    if (file) handleImageFile(file)
  }

  const modalTitle = t('addRecipe.importRecipe')

  const filteredPersonalRecipes = personalRecipes.filter((r) =>
    r.title.toLowerCase().includes(librarySearch.toLowerCase())
  )

  const handleModalOpenChange = (open: boolean) => {
    if (!open) handleClose()
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={handleModalOpenChange}>
      <ModalBackdrop isDismissable>
        <ModalContainer
          size="lg"
          scroll="inside"
          className="!rounded-xl overflow-hidden"
        >
          <ModalDialog className="max-h-[calc(100dvh-2rem)] sm:max-h-[700px]">
            <ModalHeader>{modalTitle}</ModalHeader>
            <ModalBody>
              {!loading &&
                activeHouseholdId &&
                personalRecipes.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                      {t('addRecipe.fromPersonalLibrary')}
                    </p>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 shrink-0 pointer-events-none" />
                      <input
                        type="text"
                        placeholder={t('recipes.searchPlaceholder')}
                        value={librarySearch}
                        onChange={(e) => setLibrarySearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                    <ul className="max-h-44 overflow-y-auto flex flex-col gap-0.5">
                      {filteredPersonalRecipes.map((r) => (
                        <li key={r.id}>
                          <button
                            type="button"
                            disabled={linking}
                            onClick={() => handleLink(r.id)}
                            className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left text-sm hover:bg-zinc-100 transition-colors disabled:opacity-50"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {r.thumbnail_url && (
                                <NetworkImage
                                  src={proxyUrl(r.thumbnail_url)!}
                                  alt=""
                                  className="w-8 h-8 rounded shrink-0"
                                />
                              )}
                              <span className="truncate font-medium">
                                {r.title}
                              </span>
                            </div>
                            <span className="text-xs text-primary shrink-0 font-semibold">
                              {t('common.add')}
                            </span>
                          </button>
                        </li>
                      ))}
                      {filteredPersonalRecipes.length === 0 && (
                        <li className="text-sm text-zinc-400 px-3 py-2">
                          {t('recipes.noResults')}
                        </li>
                      )}
                    </ul>
                    <div className="flex items-center gap-2 text-xs text-zinc-400 pt-1">
                      <div className="flex-1 h-px bg-zinc-200" />
                      <span>{t('addRecipe.orImportFromUrl')}</span>
                      <div className="flex-1 h-px bg-zinc-200" />
                    </div>
                  </div>
                )}

              {!loading && (
                <div className="flex flex-col gap-3">
                  <div className="flex gap-1.5">
                    {IMPORT_METHODS.map(({ key, labelKey, Icon }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setImportMode(key)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                          importMode === key
                            ? 'bg-primary text-white'
                            : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {t(labelKey)}
                      </button>
                    ))}
                  </div>

                  {importMode === 'url' && (
                    <form
                      id="import-form"
                      onSubmit={handleSubmit}
                      className="flex flex-col gap-3"
                    >
                      <div className="flex gap-1.5 flex-wrap">
                        {IMPORT_SOURCE_BADGES.map(({ label, icon }) => (
                          <span
                            key={label}
                            className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-500"
                          >
                            {icon} {label}
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-2 items-end">
                        <div className="flex flex-col gap-1 flex-1">
                          <label
                            className="text-sm font-medium"
                            htmlFor="recipe-url"
                          >
                            {t('addRecipe.recipeUrl')}
                          </label>
                          <input
                            id="recipe-url"
                            type="url"
                            placeholder={t('addRecipe.urlPlaceholder')}
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            required
                            className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-primary/30"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          onPress={handlePaste}
                          className="shrink-0 mb-0.5"
                        >
                          {t('addRecipe.paste')}
                        </Button>
                      </div>
                    </form>
                  )}

                  {importMode === 'text' && (
                    <form
                      id="import-form"
                      onSubmit={handleSubmit}
                      className="flex flex-col gap-1"
                    >
                      <label
                        className="text-sm font-medium"
                        htmlFor="recipe-text"
                      >
                        {t('addRecipe.methodText')}
                      </label>
                      <textarea
                        id="recipe-text"
                        rows={7}
                        placeholder={t('addRecipe.pasteTextPlaceholder')}
                        value={pastedText}
                        onChange={(e) => setPastedText(e.target.value)}
                        required
                        className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                      />
                    </form>
                  )}

                  {importMode === 'image' && (
                    <div className="flex flex-col gap-2">
                      <input
                        ref={importImageInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleImportImageInputChange}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onPress={() => importImageInputRef.current?.click()}
                        isDisabled={loading}
                      >
                        {t('addRecipe.methodGallery')}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {error && (
                <div className="bg-danger-50 text-danger rounded-lg p-3 text-sm mt-2">
                  <strong>{t('addRecipe.importFailed')}</strong>
                  <p className="mt-1">{error}</p>
                </div>
              )}

            </ModalBody>
            <ModalFooter className="flex flex-col gap-2 items-stretch">
              <div className="flex justify-end gap-2">
                <Button
                  variant="tertiary"
                  onPress={handleClose}
                  isDisabled={loading}
                >
                  {t('common.cancel')}
                </Button>
                {importMode !== 'image' && (
                    <Button
                      variant="primary"
                      type="submit"
                      form="import-form"
                      isDisabled={loading}
                    >
                      {importMode === 'text'
                        ? t('addRecipe.extractRecipe')
                        : t('addRecipe.import')}
                    </Button>
                )}
              </div>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  )
}

export default AddRecipeModal
