import {
  useRef,
  useState,
  type FocusEventHandler,
  type ReactNode,
  type RefObject,
} from 'react'
import { useTranslation } from 'react-i18next'
import type { RecipeOut, Tag } from '@carrot/shared/types'
import type { EditState } from './helpers'
import type { useRecipeDraft } from './useRecipeDraft'
import AllergenUncertainNotice from './AllergenUncertainNotice'
import EditDeleteZone from './EditDeleteZone'
import { SectionHeading } from './EditControls'
import RecipeRailBar from './RecipeRailBar'
import EditIdentity from './EditIdentity'
import EditIngredients from './EditIngredients'
import EditSpecSheet from './EditSpecSheet'
import EditSteps from './EditSteps'
import PopupNotes from './PopupNotes'
import { useIsDesktop } from './useIsDesktop'
import { useRailPhotoHidden } from './useRailPhotoHidden'

type Draft = ReturnType<typeof useRecipeDraft>

interface RecipeEditLayoutProps {
  recipe: RecipeOut
  draft: EditState
  draftActions: Omit<Draft, 'draft' | 'setDraft'>
  dirty: boolean
  busy: boolean
  error: string | null
  confirmingDelete: boolean
  canDelete: boolean
  householdName: string | null
  isAuthor: boolean
  tags: Tag[]
  allTags: Tag[]
  onTagAdd: (tag: Tag) => void
  onTagRemove: (tagId: string) => void
  onTagCreate: (name: string) => Promise<Tag>
  fileInputRef: RefObject<HTMLInputElement | null>
  imgUploading: boolean
  notes: string
  onNotesChange: (value: string) => void
  onNotesBlur: FocusEventHandler<HTMLTextAreaElement>
  onSave: () => void
  onCancel: () => void
  onRequestDelete: () => void
  onCancelDelete: () => void
  onRemoveFromHousehold: () => void
  onDeleteEverywhere: () => void
  renderRelated: (desktop: boolean) => ReactNode
}

const ModeToggle = ({
  textMode,
  onChange,
}: {
  textMode: boolean
  onChange: (textMode: boolean) => void
}) => {
  const { t } = useTranslation()
  const tab = (active: boolean) =>
    `rounded-lg px-3 py-2 text-[13px] font-extrabold lg:px-3.5 lg:py-1.5 ${
      active
        ? 'bg-white text-[#1F1D2B] shadow-[0_1px_3px_rgba(31,29,43,0.12)]'
        : 'text-[#6B6A78]'
    }`

  return (
    <div className="flex rounded-[10px] bg-[#F4F3F7] p-[3px]">
      <button
        type="button"
        onClick={() => onChange(false)}
        aria-pressed={!textMode}
        className={tab(!textMode)}
      >
        {t('recipes.rowsView')}
      </button>
      <button
        type="button"
        onClick={() => onChange(true)}
        aria-pressed={textMode}
        className={tab(textMode)}
      >
        {t('recipes.pasteText')}
      </button>
    </div>
  )
}

const RecipeEditLayout = ({
  recipe,
  draft,
  draftActions,
  dirty,
  busy,
  error,
  confirmingDelete,
  canDelete,
  householdName,
  isAuthor,
  tags,
  allTags,
  onTagAdd,
  onTagRemove,
  onTagCreate,
  fileInputRef,
  imgUploading,
  notes,
  onNotesChange,
  onNotesBlur,
  onSave,
  onCancel,
  onRequestDelete,
  onCancelDelete,
  onRemoveFromHousehold,
  onDeleteEverywhere,
  renderRelated,
}: RecipeEditLayoutProps) => {
  const { t } = useTranslation()
  const desktop = useIsDesktop()
  const [textMode, setTextMode] = useState(false)
  const railRef = useRef<HTMLElement>(null)
  const photoRef = useRef<HTMLDivElement>(null)
  const photoHidden = useRailPhotoHidden(desktop, railRef, photoRef)
  const showComponentNames = draft.components.length > 1
  const ingredientCount = draft.components.reduce(
    (sum, component) => sum + component.ingredients.length,
    0
  )
  const stepCount = draft.components.reduce(
    (sum, component) => sum + component.steps.length,
    0
  )
  const canSave = dirty && !busy

  const identity = (
    <EditIdentity
      recipe={recipe}
      draft={draft}
      onTitleChange={(value) => draftActions.setField('title', value)}
      tags={tags}
      allTags={allTags}
      onTagAdd={onTagAdd}
      onTagRemove={onTagRemove}
      onTagCreate={onTagCreate}
      fileInputRef={fileInputRef}
      photoRef={photoRef}
      imgUploading={imgUploading}
      onRemovePhoto={() => draftActions.setThumbnailUrl(null)}
    />
  )
  const spec = <EditSpecSheet draft={draft} onField={draftActions.setField} />
  const allergenNotice =
    recipe.allergen_status === 'uncertain' ? <AllergenUncertainNotice /> : null
  const notesField = (
    <PopupNotes
      value={notes}
      onChange={onNotesChange}
      onBlur={onNotesBlur}
      desktop={desktop}
    />
  )
  const deleteZone = (
    <EditDeleteZone
      confirming={confirmingDelete}
      busy={busy}
      canDelete={canDelete}
      householdName={householdName}
      isAuthor={isAuthor}
      onRequestDelete={onRequestDelete}
      onCancelDelete={onCancelDelete}
      onRemoveFromHousehold={onRemoveFromHousehold}
      onDeleteEverywhere={onDeleteEverywhere}
    />
  )

  const componentName = (name: string) =>
    showComponentNames ? (
      <h3 className="text-sm font-bold text-[#6B6A78]">{name}</h3>
    ) : null

  const ingredients = (
    <section className="flex flex-col gap-2.5">
      <SectionHeading
        title={t('recipes.sectionIngredients')}
        count={t('recipes.ingredientsCount', { count: ingredientCount })}
      >
        <ModeToggle textMode={textMode} onChange={setTextMode} />
      </SectionHeading>
      {draft.components.map((component, ci) => (
        <div key={ci} className="flex flex-col gap-2">
          {componentName(component.name)}
          <EditIngredients
            component={component}
            componentIndex={ci}
            textMode={textMode}
            onChange={draftActions.setIngredient}
            onAdd={draftActions.addIngredient}
            onRemove={draftActions.removeIngredient}
            onReplaceAll={draftActions.replaceIngredients}
          />
        </div>
      ))}
    </section>
  )
  const steps = (
    <section className="flex flex-col gap-2.5">
      <SectionHeading
        title={t('recipes.method')}
        count={t('recipes.stepsCount', { count: stepCount })}
      />
      {draft.components.map((component, ci) => (
        <div key={ci} className="flex flex-col gap-2">
          {componentName(component.name)}
          <EditSteps
            component={component}
            componentIndex={ci}
            onChange={draftActions.setStep}
            onAdd={draftActions.addStep}
            onRemove={draftActions.removeStep}
          />
        </div>
      ))}
    </section>
  )

  const status = dirty
    ? `● ${t('recipes.unsavedChanges')}`
    : t('recipes.noChangesYet')
  const statusColor = dirty ? 'text-[#C4652A]' : 'text-[#A9A6B4]'
  const errorBanner = error && (
    <p
      role="alert"
      className="rounded-xl bg-[#FDE8E8] px-3.5 py-2.5 text-sm font-bold text-[#7A1E1E]"
    >
      {error}
    </p>
  )

  if (desktop) {
    return (
      <div className="grid h-full min-h-0 grid-cols-[340px_minmax(0,1fr)] bg-white font-['Nunito',system-ui,sans-serif] text-[#1F1D2B]">
        <aside
          ref={railRef}
          className="flex min-h-0 flex-col gap-[18px] overflow-auto border-r border-[#ECEAF0] bg-white px-[22px] pb-6 pt-3 [scrollbar-width:thin]"
        >
          <RecipeRailBar
            title={draft.title}
            thumbnailUrl={draft.thumbnail_url}
            className="-mx-[22px] -mb-[18px]"
            visible={photoHidden}
            onBackToTop={() =>
              railRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
            }
          />
          {identity}
          {spec}
          {allergenNotice}
          {notesField}
          {renderRelated(true)}
          {deleteZone}
        </aside>
        <div className="flex min-h-0 flex-col">
          <header className="flex shrink-0 items-center gap-3 border-b border-[#ECEAF0] py-4 pl-7 pr-6">
            <span className="flex items-center gap-1.5 rounded-full bg-[#FDEFE4] px-3 py-1.5 text-[13px] font-extrabold text-[#C4652A]">
              {t('recipes.editingBadge')}
            </span>
            <span className={`text-sm font-bold ${statusColor}`}>{status}</span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="rounded-xl bg-[#F4F3F7] px-[18px] py-2.5 text-[15px] font-extrabold hover:bg-[#ECEAF0] disabled:opacity-60"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={!canSave}
              className="rounded-xl bg-[#E8894A] px-[22px] py-2.5 text-[15px] font-extrabold text-white transition-colors disabled:cursor-default disabled:bg-[#F3C5A6]"
            >
              {busy ? t('common.saving') : t('common.save')}
            </button>
          </header>
          <div className="flex flex-1 flex-col gap-6 overflow-auto px-7 pb-8 pt-5">
            {errorBanner}
            {ingredients}
            {steps}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white font-['Nunito',system-ui,sans-serif] text-[#1F1D2B]">
      <header className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-[#ECEAF0] px-2 pb-2.5 pt-[max(0.25rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="justify-self-start px-3 py-2.5 text-base font-bold text-[#4A4858] disabled:opacity-60"
        >
          {t('common.cancel')}
        </button>
        <div className="flex flex-col items-center">
          <span className="text-base font-extrabold">
            {t('recipes.editRecipe')}
          </span>
          <span className={`text-xs font-bold ${statusColor}`}>{status}</span>
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className="justify-self-end px-3 py-2.5 text-base font-extrabold text-[#E07B39] disabled:text-[#C9C6D1]"
        >
          {busy ? t('common.saving') : t('common.save')}
        </button>
      </header>
      <div className="flex flex-1 flex-col gap-5 overflow-auto px-[18px] pb-10 pt-3.5 [scrollbar-width:none]">
        {errorBanner}
        {identity}
        {spec}
        {allergenNotice}
        {ingredients}
        {steps}
        {notesField}
        {renderRelated(false)}
        {deleteZone}
      </div>
    </div>
  )
}

export default RecipeEditLayout
