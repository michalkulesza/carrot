import { FormEvent, useEffect, useRef, useState, useCallback } from 'react'
import {
  ExternalLink,
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
  Switch,
  toast,
} from '@heroui/react'
import type {
  AllergenFlag,
  ImportResult,
  RecipeComponent,
  RecipeOut,
  StageEvent,
  StepIngredientRef,
  StreamCallbacks,
  Tag,
  UserPreferences,
} from '@platekeeper/shared/types'
import {
  streamImport,
  streamTextImportFetch,
  streamImageImportFetch,
  saveRecipe,
  createTag,
  listPersonalRecipes,
  linkRecipeToHousehold,
  uploadThumbnail,
  UNITS,
} from '../api/client'
import TagRow from './TagRow'
import { useHousehold } from '../context/HouseholdContext'
import { proxyUrl } from '../utils/imageUtils'

// ── Types ────────────────────────────────────────────────────────────────────

interface StepState extends StageEvent {
  status: 'active' | 'done'
}

interface StructuredIngredient {
  qty: string
  unit: string
  name: string
  note: string
}

const parseIngredient = (s: string): StructuredIngredient => {
  const trimmed = s.trim()
  if (!trimmed) return { qty: '', unit: '', name: '', note: '' }
  let rest = trimmed
  let note = ''
  const noteMatch = rest.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
  if (noteMatch) {
    rest = noteMatch[1].trim()
    note = noteMatch[2]
  }
  const parts = rest.split(/\s+/)
  let idx = 0
  let qty = ''
  if (parts[idx] && /^[\d¼½¾⅓⅔⅛⅜⅝⅞.,/]+$/.test(parts[idx])) {
    qty = parts[idx++]
  }
  let unit = ''
  if (parts[idx] && (UNITS as readonly string[]).includes(parts[idx].toLowerCase())) {
    unit = parts[idx++].toLowerCase()
  }
  return { qty, unit, name: parts.slice(idx).join(' '), note }
}

const serializeIngredient = (ing: StructuredIngredient): string => {
  return [ing.qty, ing.unit, ing.name, ing.note ? `(${ing.note})` : '']
    .filter(Boolean)
    .join(' ')
}

interface EditableComponent {
  name: string
  yield_note: string
  ingredients: StructuredIngredient[]
  steps: string[]
  ingredient_flags: (AllergenFlag | null)[]
  step_ingredient_refs: StepIngredientRef[][] | null
}

interface EditableRecipe {
  title: string
  servings: string
  kcal: string
  thumbnail_url: string | null
  creator_handle: string | null
  source_url: string | null
  stage: string
  components: EditableComponent[]
  suggestedTagNames: string[]
}

const toEditable = (
  result: ImportResult,
  autoSubstitute: boolean
): EditableRecipe => {
  const { recipe, metadata, stage } = result

  return {
    title: recipe?.title ?? '',
    servings: recipe?.servings?.toString() ?? '',
    kcal: recipe?.kcal_per_serving?.toString() ?? '',
    thumbnail_url: metadata.thumbnail_url,
    creator_handle: metadata.creator_handle,
    source_url: metadata.source_url || null,
    stage,
    suggestedTagNames: recipe?.tags ?? [],
    components: (recipe?.components ?? []).map((c: RecipeComponent) => {
      const numSteps = c.steps.length
      let step_ingredient_refs: StepIngredientRef[][] | null = null
      if (c.step_refs && c.step_refs.length > 0) {
        const arr: StepIngredientRef[][] = Array.from({ length: numSteps }, () => [])
        for (const ref of c.step_refs) {
          if (ref.step_index < numSteps) {
            arr[ref.step_index].push({ ingredient_index: ref.ingredient_index, mention: ref.mention })
          }
        }
        step_ingredient_refs = arr
      }
      return {
        name: c.name ?? c.role,
        yield_note: c.yield_note ?? '',
        ingredients: c.ingredients.map((ing) => {
          const useSub = autoSubstitute && !!ing.allergen && !!ing.substitute
          const nameToUse = useSub ? ing.substitute! : ing.name
          // Gemini sometimes returns the full ingredient string in name with null qty/unit
          if (!ing.qty) {
            const fullStr = [nameToUse, ing.note ? `(${ing.note})` : ''].filter(Boolean).join(' ')
            return parseIngredient(fullStr)
          }
          return {
            qty: ing.qty ?? '',
            unit: ing.unit ?? '',
            name: nameToUse,
            note: ing.note ?? '',
          }
        }),
        steps: c.steps,
        ingredient_flags: c.ingredients.map((ing) => ({
          allergen: ing.allergen ?? null,
          substitute: ing.substitute ?? null,
          substitute_applied:
            autoSubstitute && !!ing.allergen && !!ing.substitute,
          original_display: null,
          ingredient_name: ing.name,
        })),
        step_ingredient_refs,
      }
    }),
  }
}

// ── Allergen popover ──────────────────────────────────────────────────────────

const AllergenPopover = ({
  flag,
  activeAllergens,
  onReplace,
  onRestore,
}: {
  flag: AllergenFlag
  activeAllergens: string[]
  onReplace: () => void
  onRestore: () => void
}) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)

    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const isActive =
    flag.allergen &&
    activeAllergens.some((a) => {
      const fa = flag.allergen!.toLowerCase()
      const la = a.toLowerCase()

      return fa === la || fa.includes(la) || la.includes(fa)
    })
  if (!isActive) return null

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 text-xs font-medium whitespace-nowrap"
        title={t('recipes.contains') + ' ' + flag.allergen}
      >
        ⚠ {flag.allergen}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-zinc-200 rounded-xl shadow-lg p-3 min-w-[220px] text-sm">
          {flag.substitute_applied && flag.original_display ? (
            <>
              <p className="text-zinc-600 mb-2">
                {t('recipes.originally')}{' '}
                <strong className="text-zinc-800">
                  {flag.original_display}
                </strong>
                , {t('recipes.replacedWith')}{' '}
                <strong className="text-zinc-800">{flag.substitute}</strong>{' '}
                {t('recipes.dueTo')} {flag.allergen}.
              </p>
              <Button
                size="sm"
                variant="secondary"
                onPress={() => {
                  onRestore()
                  setOpen(false)
                }}
              >
                {t('recipes.restoreOriginal')}
              </Button>
            </>
          ) : flag.substitute ? (
            <>
              <p className="text-zinc-600 mb-2">
                {t('recipes.contains')}{' '}
                <strong className="text-zinc-800">{flag.allergen}</strong>.{' '}
                {t('recipes.suggestedSubstitute')}{' '}
                <strong className="text-zinc-800">{flag.substitute}</strong>.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  onPress={() => {
                    onReplace()
                    setOpen(false)
                  }}
                >
                  {t('recipes.replace')}
                </Button>
                <Button
                  size="sm"
                  variant="tertiary"
                  onPress={() => setOpen(false)}
                >
                  {t('recipes.keepOriginal')}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-zinc-600">
              {t('recipes.contains')}{' '}
              <strong className="text-zinc-800">{flag.allergen}</strong>.{' '}
              {t('recipes.noSubstituteAvailable')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Progress bar ─────────────────────────────────────────────────────────────

// Client-side heuristic mapping of stage keys to progress fractions, kept in
// sync with the equivalent STAGE_PROGRESS table in
// apps/mobile/src/screens/ImportRecipeScreen.tsx — the backend only emits
// discrete named stages, no numeric progress value.
const STAGE_PROGRESS: Record<string, number> = {
  fetching_page: 0.25,
  analyzing_page: 0.7,
  fetching_metadata: 0.15,
  checking_description: 0.35,
  checking_links: 0.55,
  fetching_transcript: 0.65,
  analyzing_transcript: 0.82,
  analyzing_text: 0.7,
  analyzing_image: 0.7,
}

const ImportProgressBar = ({ steps }: { steps: StepState[] }) => {
  if (steps.length === 0) return null
  const current = steps[steps.length - 1]
  const fraction =
    current.status === 'done' ? 1 : (STAGE_PROGRESS[current.key] ?? 0.5)

  return (
    <div className="mt-3 h-1.5 w-full rounded-full bg-zinc-200 overflow-hidden">
      <div
        className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
        style={{ width: `${fraction * 100}%` }}
      />
    </div>
  )
}

// ── Inline editable text field ────────────────────────────────────────────────

const EditLine = ({
  value,
  onChange,
  className = '',
  multiline = false,
}: {
  value: string
  onChange: (v: string) => void
  className?: string
  multiline?: boolean
}) => {
  const base =
    'w-full bg-transparent border-b border-transparent hover:border-zinc-300 focus:border-primary focus:outline-none transition-colors resize-none overflow-hidden'
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (ref.current && multiline) {
      ref.current.style.height = 'auto'
      ref.current.style.height = `${ref.current.scrollHeight}px`
    }
  }, [value, multiline])

  if (!multiline) {
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full bg-transparent border-b border-transparent hover:border-zinc-300 focus:border-primary focus:outline-none transition-colors ${className}`}
      />
    )
  }

  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      onChange={(e) => onChange(e.target.value)}
      className={`${base} ${className}`}
    />
  )
}

// ── Structured ingredient editor ──────────────────────────────────────────────

const IngredientEditor = ({
  value,
  onChange,
}: {
  value: StructuredIngredient
  onChange: (v: StructuredIngredient) => void
}) => {
  const { t } = useTranslation()
  const inputBase =
    'bg-transparent border-b border-transparent hover:border-zinc-300 focus:border-primary focus:outline-none transition-colors text-sm'

  const update = (field: keyof StructuredIngredient, val: string) => {
    onChange({ ...value, [field]: val })
  }

  return (
    <div className="flex items-center gap-1 flex-1 min-w-0">
      <input
        type="text"
        value={value.qty}
        onChange={(e) => update('qty', e.target.value)}
        placeholder={t('units.qtyLabel')}
        aria-label={t('units.qtyLabel')}
        className={`${inputBase} w-10 text-center shrink-0`}
      />
      <select
        value={value.unit}
        onChange={(e) => update('unit', e.target.value)}
        aria-label={t('units.unitLabel')}
        className={`${inputBase} shrink-0 cursor-pointer text-zinc-500 max-w-[7rem]`}
      >
        <option value="">—</option>
        {UNITS.map((u) => (
          <option key={u} value={u}>
            {t(`units.${u}`)}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={value.name}
        onChange={(e) => update('name', e.target.value)}
        aria-label="ingredient name"
        className={`${inputBase} flex-1 min-w-0`}
      />
      <input
        type="text"
        value={value.note}
        onChange={(e) => update('note', e.target.value)}
        placeholder={t('units.noteLabel')}
        aria-label={t('units.noteLabel')}
        className={`${inputBase} w-16 text-zinc-400 italic shrink-0`}
      />
    </div>
  )
}

// ── Editable recipe ───────────────────────────────────────────────────────────

const currentUsername = () => localStorage.getItem('pk_username') || 'you'

const EditableRecipeView = ({
  recipe,
  recipeId,
  selectedTags,
  allTags,
  activeAllergens,
  onChange,
  onTagAdd,
  onTagRemove,
  onTagCreate,
}: {
  recipe: EditableRecipe
  recipeId: string
  selectedTags: Tag[]
  allTags: Tag[]
  activeAllergens: string[]
  onChange: (r: EditableRecipe) => void
  onTagAdd: (tag: Tag) => void
  onTagRemove: (tagId: string) => void
  onTagCreate: (name: string) => Promise<Tag>
}) => {
  const { t } = useTranslation()
  const [isAdapted, setIsAdapted] = useState(false)
  const [imgUploading, setImgUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const setTitle = (title: string) => {
    onChange({ ...recipe, title })
  }
  const setServings = (servings: string) => {
    onChange({ ...recipe, servings })
  }
  const setKcal = (kcal: string) => {
    onChange({ ...recipe, kcal })
  }

  const setIngredient = (ci: number, ii: number, val: StructuredIngredient) => {
    setIsAdapted(true)
    const components = recipe.components.map((c, ci2) =>
      ci2 !== ci
        ? c
        : {
            ...c,
            ingredients: c.ingredients.map((ing, ii2) =>
              ii2 === ii ? val : ing
            ),
          }
    )
    onChange({ ...recipe, components })
  }

  const handleReplace = (ci: number, ii: number) => {
    const comp = recipe.components[ci]
    const flag = comp.ingredient_flags[ii]
    if (!flag?.substitute) return
    const originalDisplay = serializeIngredient(comp.ingredients[ii])
    const newIngredients = comp.ingredients.map((ing, idx) =>
      idx === ii ? parseIngredient(flag.substitute!) : ing
    )
    const newFlags = comp.ingredient_flags.map((f, idx) =>
      idx === ii
        ? { ...f!, substitute_applied: true, original_display: originalDisplay }
        : f
    )
    const components = recipe.components.map((c, ci2) =>
      ci2 !== ci
        ? c
        : { ...c, ingredients: newIngredients, ingredient_flags: newFlags }
    )
    onChange({ ...recipe, components })
  }

  const handleRestore = (ci: number, ii: number) => {
    const comp = recipe.components[ci]
    const flag = comp.ingredient_flags[ii]
    if (!flag?.original_display) return
    const newIngredients = comp.ingredients.map((ing, idx) =>
      idx === ii ? parseIngredient(flag.original_display!) : ing
    )
    const newFlags = comp.ingredient_flags.map((f, idx) =>
      idx === ii
        ? { ...f!, substitute_applied: false, original_display: null }
        : f
    )
    const components = recipe.components.map((c, ci2) =>
      ci2 !== ci
        ? c
        : { ...c, ingredients: newIngredients, ingredient_flags: newFlags }
    )
    onChange({ ...recipe, components })
  }

  const setStep = (ci: number, si: number, val: string) => {
    setIsAdapted(true)
    const components = recipe.components.map((c, ci2) =>
      ci2 !== ci
        ? c
        : {
            ...c,
            steps: c.steps.map((s, si2) => (si2 === si ? val : s)),
          }
    )
    onChange({ ...recipe, components })
  }

  const handleThumbnailFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImgUploading(true)
    try {
      const result = await uploadThumbnail(file, recipeId)
      onChange({ ...recipe, thumbnail_url: result.url })
    } catch {
      // keep existing thumbnail on failure
    } finally {
      setImgUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [recipeId, recipe, onChange])

  const proxied = proxyUrl(recipe.thumbnail_url)

  const originalHandle = recipe.creator_handle
  const myHandle = currentUsername()

  return (
    <div className="mt-4 border-t border-zinc-200 pt-4">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleThumbnailFile}
      />

      {/* Header */}
      <div className="flex gap-3 items-start mb-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={imgUploading}
          className="relative w-16 h-16 rounded-lg shrink-0 overflow-hidden bg-zinc-100 group cursor-pointer disabled:opacity-60"
          aria-label={t('common.changePhoto')}
        >
          {proxied ? (
            <img
              src={proxied}
              alt="thumbnail"
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
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
        <div className="flex-1 min-w-0">
          <EditLine
            value={recipe.title}
            onChange={setTitle}
            className="text-lg font-bold leading-snug"
            multiline
          />
        </div>
      </div>

      {/* Tags */}
      <div className="mb-3">
        <TagRow
          tags={selectedTags}
          allTags={allTags}
          onAdd={onTagAdd}
          onRemove={onTagRemove}
          onCreateTag={onTagCreate}
        />
      </div>

      {/* Pills */}
      <div className="flex flex-col gap-2 mb-4">
        {(originalHandle || recipe.source_url) && (
          <div className="flex flex-wrap gap-2">
            {originalHandle && (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full bg-zinc-100 text-zinc-500">
                {t('addRecipe.by', { handle: originalHandle })}
              </span>
            )}
            {recipe.source_url && (
              <a
                href={recipe.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 transition-colors"
              >
                <ExternalLink className="w-3 h-3 shrink-0" />
                {t('recipes.source')}
              </a>
            )}
            {isAdapted && (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full bg-success/10 text-success-700 animate-appearance-in">
                ✎ {t('addRecipe.adaptedBy', { handle: myHandle })}
              </span>
            )}
          </div>
        )}
        {(recipe.servings !== '' || recipe.kcal !== '') && (
          <div className="flex gap-2">
            {recipe.servings !== '' && (
              <label className="flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-medium pl-3 pr-2 py-1.5 rounded-full cursor-text">
                <span>{t('recipes.serves')}</span>
                <input
                  type="number"
                  min={1}
                  max={67}
                  value={recipe.servings}
                  onChange={(e) => {
                    const v = Math.min(67, Math.max(1, Number(e.target.value)))
                    setServings(String(v))
                  }}
                  className="w-[2.2ch] bg-transparent text-primary font-semibold text-xs text-center focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              </label>
            )}
            {recipe.kcal !== '' && (
              <label className="flex items-center gap-1.5 bg-warning/10 text-warning-700 text-xs font-medium pl-2 pr-3 py-1.5 rounded-full cursor-text">
                <input
                  type="number"
                  min={1}
                  max={9999}
                  value={recipe.kcal}
                  onChange={(e) => {
                    const v = Math.min(
                      9999,
                      Math.max(1, Number(e.target.value))
                    )
                    setKcal(String(v))
                  }}
                  className="w-[3.8ch] bg-transparent text-warning-700 font-semibold text-xs text-center focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span>{t('recipes.kcalPerServing')}</span>
              </label>
            )}
          </div>
        )}
      </div>

      {/* Components */}
      {recipe.components.map((comp, ci) => (
        <div key={ci} className="mb-5">
          {recipe.components.length > 1 && (
            <h3 className="text-sm font-semibold text-zinc-600 mb-2">
              {comp.name}
            </h3>
          )}

          {comp.ingredients.length > 0 && (
            <>
              <p className="text-xs font-semibold uppercase text-zinc-400 mb-1">
                {t('recipes.sectionIngredients')}
              </p>
              <ul className="space-y-1 mb-3">
                {comp.ingredients.map((ing, ii) => {
                  const flag = comp.ingredient_flags[ii]

                  return (
                    <li key={ii} className="flex items-start gap-2 text-sm">
                      <span className="text-zinc-300 mt-1.5 shrink-0">·</span>
                      <IngredientEditor
                        value={ing}
                        onChange={(v) => setIngredient(ci, ii, v)}
                      />
                      {flag && (
                        <AllergenPopover
                          flag={flag}
                          activeAllergens={activeAllergens}
                          onReplace={() => handleReplace(ci, ii)}
                          onRestore={() => handleRestore(ci, ii)}
                        />
                      )}
                    </li>
                  )
                })}
              </ul>
            </>
          )}

          {comp.steps.length > 0 && (
            <>
              <p className="text-xs font-semibold uppercase text-zinc-400 mb-1">
                {t('recipes.steps')}
              </p>
              <ol className="space-y-2">
                {comp.steps.map((step, si) => (
                  <li key={si} className="flex items-start gap-2 text-sm">
                    <span className="text-zinc-400 font-medium shrink-0">
                      {si + 1}.
                    </span>
                    <EditLine
                      value={step}
                      onChange={(v) => setStep(ci, si, v)}
                      multiline
                    />
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Modal ────────────────────────────────────────────────────────────────────

interface AddRecipeModalProps {
  isOpen: boolean
  onClose: () => void
  onSaved?: () => void
  allTags: Tag[]
  onTagCreated: (tag: Tag) => void
  preferences: UserPreferences | null
}

const AddRecipeModal = ({
  isOpen,
  onClose,
  onSaved,
  allTags,
  onTagCreated,
  preferences,
}: AddRecipeModalProps) => {
  const { t } = useTranslation()
  const { activeHouseholdId, activeHousehold } = useHousehold()
  const tempRecipeIdRef = useRef(crypto.randomUUID())
  const [importMode, setImportMode] = useState<'url' | 'text' | 'image'>('url')
  const [url, setUrl] = useState('')
  const [pastedText, setPastedText] = useState('')
  const importImageInputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [progressSteps, setProgressSteps] = useState<StepState[]>([])
  const [editable, setEditable] = useState<EditableRecipe | null>(null)
  const [selectedTags, setSelectedTags] = useState<Tag[]>([])
  const [sharedToPersonal, setSharedToPersonal] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const cancelRef = useRef<(() => void) | null>(null)
  const [personalRecipes, setPersonalRecipes] = useState<RecipeOut[]>([])
  const [librarySearch, setLibrarySearch] = useState('')
  const [linking, setLinking] = useState(false)

  const activeAllergens: string[] = activeHousehold?.allergens
    ? [
        ...(activeHousehold.allergens.predefined ?? []),
        ...(activeHousehold.allergens.custom ?? []),
      ]
    : preferences?.personal_allergens
      ? [
          ...(preferences.personal_allergens.predefined ?? []),
          ...(preferences.personal_allergens.custom ?? []),
        ]
      : []

  const autoSubstitute = preferences?.auto_substitute ?? false

  useEffect(() => {
    if (isOpen && activeHouseholdId) {
      listPersonalRecipes()
        .then(setPersonalRecipes)
        .catch(() => {})
    }
  }, [isOpen, activeHouseholdId])

  const reset = () => {
    cancelRef.current?.()
    setImportMode('url')
    setUrl('')
    setPastedText('')
    if (importImageInputRef.current) importImageInputRef.current.value = ''
    setLoading(false)
    setSaving(false)
    setProgressSteps([])
    setEditable(null)
    setSelectedTags([])
    setSharedToPersonal(true)
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

  async function handleTagCreate(name: string): Promise<Tag> {
    const tag = await createTag(name)
    onTagCreated(tag)

    return tag
  }

  async function handleSave() {
    if (!editable) return
    setSaving(true)
    setError(null)
    try {
      await saveRecipe({
        title: editable.title,
        servings: editable.servings !== '' ? Number(editable.servings) : null,
        kcal_per_serving: editable.kcal !== '' ? Number(editable.kcal) : null,
        thumbnail_url: editable.thumbnail_url,
        creator_handle: editable.creator_handle,
        source_url: editable.source_url,
        components: editable.components.map((c) => ({
          name: c.name,
          yield_note: c.yield_note,
          ingredients: c.ingredients.map(serializeIngredient),
          steps: c.steps,
          ingredient_flags: c.ingredient_flags.map(
            (f) =>
              f ?? {
                allergen: null,
                substitute: null,
                substitute_applied: false,
                original_display: null,
              }
          ),
          step_ingredient_refs: c.step_ingredient_refs,
        })),
        tag_ids: selectedTags.map((t) => t.id),
        shared_to_personal: sharedToPersonal,
      })
      toast.success(t('addRecipe.recipeSaved'), { timeout: 3000 })
      onSaved?.()
      reset()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('addRecipe.failedToSave'))
    } finally {
      setSaving(false)
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

  const startImport = (starter: (callbacks: StreamCallbacks) => () => void) => {
    cancelRef.current?.()
    setLoading(true)
    setError(null)
    setEditable(null)
    setSelectedTags([])
    setProgressSteps([])

    cancelRef.current = starter({
      onStage(stage) {
        setProgressSteps((prev) => {
          const updated = prev.map((s) =>
            s.status === 'active' ? { ...s, status: 'done' as const } : s
          )

          return [...updated, { ...stage, status: 'active' }]
        })
      },
      onDone(res) {
        setProgressSteps((prev) =>
          prev.map((s) =>
            s.status === 'active' ? { ...s, status: 'done' as const } : s
          )
        )
        if (res.recipe) {
          const editableRecipe = toEditable(res, autoSubstitute)
          setEditable(editableRecipe)
          const suggested = allTags.filter((t) =>
            editableRecipe.suggestedTagNames.some(
              (name) => name.toLowerCase() === t.name.toLowerCase()
            )
          )
          setSelectedTags(suggested)
        } else {
          setError(
            res.error === 'extraction_failed' || !res.error
              ? t('addRecipe.couldNotExtract')
              : res.error
          )
        }
        setLoading(false)
      },
      onError(msg) {
        setError(msg)
        setLoading(false)
      },
    })
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (importMode === 'url') {
      startImport((cb) => streamImport(url, cb))
    } else if (importMode === 'text') {
      startImport((cb) => streamTextImportFetch(pastedText.trim(), cb))
    }
  }

  const handleImageFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
      startImport((cb) =>
        streamImageImportFetch(base64, file.type || 'image/jpeg', cb)
      )
    }
    reader.readAsDataURL(file)
  }

  const parsed = editable !== null

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose()
      }}
    >
      <ModalBackdrop isDismissable>
        <ModalContainer
          size="lg"
          scroll="inside"
          className="!rounded-xl overflow-hidden"
        >
          <ModalDialog className="max-h-[calc(100dvh-2rem)] sm:max-h-[700px]">
            <ModalHeader>
              {parsed ? t('addRecipe.editRecipe') : t('addRecipe.importRecipe')}
            </ModalHeader>
            <ModalBody>
              {!parsed && activeHouseholdId && personalRecipes.length > 0 && (
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
                    {personalRecipes
                      .filter((r) =>
                        r.title
                          .toLowerCase()
                          .includes(librarySearch.toLowerCase())
                      )
                      .map((r) => (
                        <li key={r.id}>
                          <button
                            type="button"
                            disabled={linking}
                            onClick={() => handleLink(r.id)}
                            className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left text-sm hover:bg-zinc-100 transition-colors disabled:opacity-50"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {r.thumbnail_url && (
                                <img
                                  src={proxyUrl(r.thumbnail_url)!}
                                  className="w-8 h-8 rounded object-cover shrink-0"
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
                    {personalRecipes.filter((r) =>
                      r.title
                        .toLowerCase()
                        .includes(librarySearch.toLowerCase())
                    ).length === 0 && (
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

              {!parsed && (
                <div className="flex flex-col gap-3">
                  <div className="flex gap-1.5">
                    {(
                      [
                        {
                          key: 'url',
                          label: t('addRecipe.fromUrl'),
                          Icon: LinkIcon,
                        },
                        {
                          key: 'text',
                          label: t('addRecipe.fromText'),
                          Icon: Type,
                        },
                        {
                          key: 'image',
                          label: t('addRecipe.fromImage'),
                          Icon: ImageIcon,
                        },
                      ] as const
                    ).map(({ key, label, Icon }) => (
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
                        {label}
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
                        {[
                          { label: 'Web', icon: '🌐' },
                          { label: 'Instagram', icon: '📸' },
                          { label: 'TikTok', icon: '🎵' },
                        ].map(({ label, icon }) => (
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
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) handleImageFile(file)
                        }}
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

              {!parsed && !error && <ImportProgressBar steps={progressSteps} />}

              {error && (
                <div className="bg-danger-50 text-danger rounded-lg p-3 text-sm mt-2">
                  <strong>{t('addRecipe.importFailed')}</strong>
                  <p className="mt-1">{error}</p>
                </div>
              )}

              {editable && (
                <EditableRecipeView
                  recipe={editable}
                  recipeId={tempRecipeIdRef.current}
                  selectedTags={selectedTags}
                  allTags={allTags}
                  activeAllergens={activeAllergens}
                  onChange={setEditable}
                  onTagAdd={(tag) => setSelectedTags((prev) => [...prev, tag])}
                  onTagRemove={(id) =>
                    setSelectedTags((prev) => prev.filter((t) => t.id !== id))
                  }
                  onTagCreate={handleTagCreate}
                />
              )}
            </ModalBody>
            <ModalFooter className="flex flex-col gap-2 items-stretch">
              {parsed && activeHouseholdId && (
                <div className="flex items-center gap-2 px-1">
                  <Switch
                    size="sm"
                    isSelected={sharedToPersonal}
                    onChange={setSharedToPersonal}
                  >
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                  </Switch>
                  <span className="text-sm text-zinc-600">
                    {t('addRecipe.alsoAddToPrivate')}
                  </span>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  variant="tertiary"
                  onPress={handleClose}
                  isDisabled={loading || saving}
                >
                  {parsed ? t('addRecipe.discard') : t('common.cancel')}
                </Button>
                {parsed ? (
                  <Button
                    variant="primary"
                    onPress={handleSave}
                    isDisabled={saving}
                  >
                    {t('common.save')}
                  </Button>
                ) : (
                  importMode !== 'image' && (
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
                  )
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
