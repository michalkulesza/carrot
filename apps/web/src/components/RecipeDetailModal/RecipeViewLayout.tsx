import { useState, type FocusEventHandler, type ReactNode } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import type { RecipeOut, SaveComponent, Tag } from '@carrot/shared/types'
import { normalizeAllergenKey } from '../../pages/SettingsPage/helpers'
import { proxyUrl } from '../../utils/imageUtils'
import NetworkImage from '../NetworkImage'
import { getRecipeAllergens } from './helpers'
import PopupNotes from './PopupNotes'
import {
  ChevronDownIcon,
  CloseIcon,
  ListIcon,
  PlayIcon,
  StarIcon,
} from './PopupIcons'
import RecipeActionRow from './RecipeActionRow'
import RecipeIngredientsCard from './RecipeIngredientsCard'
import RecipeIngredientsSheet from './RecipeIngredientsSheet'
import RecipeSpecSheet from './RecipeSpecSheet'
import RecipeStepList from './RecipeStepList'
import AllergenUncertainNotice from './AllergenUncertainNotice'
import ShareRecipeDialog from './ShareRecipeDialog'
import { useIsDesktop } from './useIsDesktop'
import { useUnifiedIngredients } from './useUnifiedIngredients'

interface RecipeViewLayoutProps {
  recipe: RecipeOut
  components: SaveComponent[]
  unitSystem: string
  servingScale: number
  selectedServings: number | null
  onDecreaseServings: () => void
  onIncreaseServings: () => void
  tags: Tag[]
  wakeLockActive: boolean
  onToggleWakeLock: () => void
  activeAllergens: string[]
  sessionAdded: Set<string>
  checkedIngredients: Set<string>
  onToggleIngredient: (key: string) => void
  onReplaceIngredient: (componentIndex: number, ingredientIndex: number) => void
  onRestoreIngredient: (componentIndex: number, ingredientIndex: number) => void
  onAddIngredient: (componentIndex: number, ingredientIndex: number) => void
  onAddAllIngredients: () => void
  onToggleFavourite: () => void
  onEdit: () => void
  onOpenMealPlan: () => void
  onOpenCookMode: () => void
  onClose: () => void
  notes: string
  onNotesChange: (value: string) => void
  onNotesBlur: FocusEventHandler<HTMLTextAreaElement>
  banners: ReactNode
  renderRelated: (desktop: boolean) => ReactNode
}

const Chip = ({
  tone,
  children,
}: {
  tone: 'tag' | 'allergen'
  children: ReactNode
}) => (
  <span
    className={`rounded-full px-[9px] py-[3px] text-xs font-bold ${
      tone === 'tag'
        ? 'bg-[#EEEAFE] text-[#5B4BC4]'
        : 'bg-[#FEF3DC] text-[#A85A0B]'
    }`}
  >
    {children}
  </span>
)

const RecipeViewLayout = ({
  recipe,
  components,
  unitSystem,
  servingScale,
  selectedServings,
  onDecreaseServings,
  onIncreaseServings,
  tags,
  wakeLockActive,
  onToggleWakeLock,
  activeAllergens,
  sessionAdded,
  checkedIngredients,
  onToggleIngredient,
  onReplaceIngredient,
  onRestoreIngredient,
  onAddIngredient,
  onAddAllIngredients,
  onToggleFavourite,
  onEdit,
  onOpenMealPlan,
  onOpenCookMode,
  onClose,
  notes,
  onNotesChange,
  onNotesBlur,
  banners,
  renderRelated,
}: RecipeViewLayoutProps) => {
  const { t } = useTranslation()
  const desktop = useIsDesktop()
  const [shareOpen, setShareOpen] = useState(false)
  const [shoppingMode, setShoppingMode] = useState(false)
  const [ingredientsOpen, setIngredientsOpen] = useState(false)
  const [doneSteps, setDoneSteps] = useState<Set<string>>(new Set())
  const { items, formatParts } = useUnifiedIngredients(
    components,
    unitSystem,
    servingScale
  )
  const thumbnail = proxyUrl(recipe.thumbnail_url)
  const hasSteps = components.some((component) => component.steps.length > 0)
  const allAdded =
    items.length > 0 && items.every(({ key }) => sessionAdded.has(key))
  const allergens = getRecipeAllergens(recipe)

  const handleToggleStep = (key: string) =>
    setDoneSteps((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)

      return next
    })

  const allergenUncertain = recipe.allergen_status === 'uncertain'
  const allergenNotice = allergenUncertain ? <AllergenUncertainNotice /> : null
  const checklist = {
    items,
    formatParts,
    checkedIngredients,
    onToggleIngredient,
    onReplaceIngredient,
    onRestoreIngredient,
    activeAllergens,
    unitSystem,
    servingScale,
    shoppingMode,
    sessionAdded,
    onAddIngredient,
    allergenUncertain,
  }
  const toggleShoppingMode = () => setShoppingMode((current) => !current)

  const stepList = (
    <RecipeStepList
      components={components}
      unitSystem={unitSystem}
      recipeId={recipe.id}
      recipeTitle={recipe.title}
      doneSteps={doneSteps}
      onToggleStep={handleToggleStep}
      desktop={desktop}
    />
  )
  const titleClass = desktop
    ? 'text-2xl font-extrabold leading-[1.2]'
    : 'text-[26px] font-extrabold leading-[1.2] tracking-[-0.01em] [text-wrap:balance]'
  const infoPanel = (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Chip key={tag.id} tone="tag">
              {tag.name}
            </Chip>
          ))}
          {allergens.map((allergen) => (
            <Chip key={allergen} tone="allergen">
              ⚠{' '}
              {t(`allergens.${normalizeAllergenKey(allergen)}`, {
                defaultValue: allergen,
              })}
            </Chip>
          ))}
        </div>
        {recipe.source_url ? (
          <a
            href={recipe.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className={`${titleClass} hover:text-[#E07B39]`}
          >
            {recipe.title}
          </a>
        ) : (
          <h2 className={titleClass}>{recipe.title}</h2>
        )}
        {(recipe.creator_handle || recipe.added_by) && (
          <p className="text-[13px] font-semibold text-[#8C8A99]">
            {[
              recipe.creator_handle
                ? t('recipes.byCreator', { handle: recipe.creator_handle })
                : '',
              recipe.added_by
                ? t('recipes.addedByName', { name: recipe.added_by })
                : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
      </div>
      <RecipeActionRow
        isFavourite={recipe.is_favourite}
        onToggleFavourite={onToggleFavourite}
        onShare={() => setShareOpen(true)}
        onOpenMealPlan={onOpenMealPlan}
        onEdit={onEdit}
        desktop={desktop}
      />
      <RecipeSpecSheet
        recipe={recipe}
        selectedServings={selectedServings}
        onDecreaseServings={onDecreaseServings}
        onIncreaseServings={onIncreaseServings}
        wakeLockActive={wakeLockActive}
        onToggleWakeLock={onToggleWakeLock}
        desktop={desktop}
      />
    </>
  )
  const notes_ = (
    <PopupNotes
      value={notes}
      onChange={onNotesChange}
      onBlur={onNotesBlur}
      desktop={desktop}
    />
  )
  const share = (
    <ShareRecipeDialog
      recipe={recipe}
      open={shareOpen}
      onClose={() => setShareOpen(false)}
    />
  )

  if (desktop) {
    return (
      <div className="grid h-full min-h-0 grid-cols-[340px_minmax(0,1fr)] bg-white font-['Nunito',system-ui,sans-serif] text-[#1F1D2B]">
        <aside className="flex min-h-0 flex-col overflow-auto border-r border-[#ECEAF0] bg-white">
          <div
            className="mx-3 mt-3 h-[200px] shrink-0 overflow-hidden rounded-[14px] bg-[#EDE7E0]"
            role="img"
            aria-label={recipe.title}
          >
            {thumbnail && (
              <NetworkImage
                src={thumbnail}
                alt={recipe.title}
                className="h-full w-full object-cover"
              />
            )}
          </div>
          <div className="flex flex-col gap-[18px] px-[22px] pb-6 pt-[18px]">
            {infoPanel}
            {notes_}
            {renderRelated(true)}
          </div>
        </aside>
        <div className="flex min-h-0 flex-col">
          <header className="flex items-center gap-4 border-b border-[#ECEAF0] px-7 py-5">
            <div className="flex-1 text-lg font-extrabold">
              {t('recipes.recipeHeading')}
            </div>
            <button
              type="button"
              onClick={onOpenCookMode}
              disabled={!hasSteps}
              className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-[#E8894A] px-5 py-[11px] text-[15px] font-extrabold text-white hover:bg-[#DD7A38] disabled:opacity-50"
            >
              <PlayIcon size={15} />
              {t('cookMode.start')}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="flex h-10 w-10 items-center justify-center rounded-[10px] text-[#6B6A78] hover:bg-[#F4F3F7]"
            >
              <CloseIcon size={18} />
            </button>
          </header>
          <div className="flex flex-1 flex-col gap-3 overflow-auto px-7 py-5">
            {banners}
            {items.length > 0 && (
              <RecipeIngredientsCard
                {...checklist}
                servings={selectedServings}
                allAdded={allAdded}
                onAddAll={onAddAllIngredients}
                onToggleShoppingMode={toggleShoppingMode}
              />
            )}
            {allergenNotice}
            {stepList}
          </div>
        </div>
        {share}
      </div>
    )
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-white font-['Nunito',system-ui,sans-serif] text-[#1F1D2B]">
      <div className="flex-1 overflow-auto pb-[120px] [scrollbar-width:none]">
        <div className="relative h-[340px] bg-[#EDE7E0]">
          {thumbnail && (
            <NetworkImage
              src={thumbnail}
              alt={recipe.title}
              className="h-full w-full object-cover"
            />
          )}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[120px] bg-gradient-to-b from-[rgba(20,16,24,0.45)] to-[rgba(20,16,24,0)]" />
          <div className="absolute inset-x-4 top-[max(1rem,env(safe-area-inset-top))] flex justify-between">
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.94]"
            >
              <ChevronDownIcon size={20} />
            </button>
            <button
              type="button"
              onClick={onToggleFavourite}
              aria-label={
                recipe.is_favourite
                  ? t('recipes.removeFromFavourites')
                  : t('recipes.addToFavourites')
              }
              className={`flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.94] ${
                recipe.is_favourite ? 'text-[#E8894A]' : 'text-[#4A4858]'
              }`}
            >
              <StarIcon fill={recipe.is_favourite ? '#E8894A' : 'none'} />
            </button>
          </div>
        </div>
        <div className="relative -mt-6 flex flex-col gap-[18px] rounded-t-3xl bg-white px-5 pt-[22px]">
          {infoPanel}
          {banners}
          {stepList}
          {notes_}
          {renderRelated(false)}
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex gap-2.5 bg-gradient-to-b from-white/0 to-white to-[22%] px-4 pb-[30px] pt-3">
        <button
          type="button"
          onClick={() => setIngredientsOpen(true)}
          className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-[14px] border border-[#E4E1EA] bg-white text-base font-extrabold shadow-[0_4px_14px_rgba(31,29,43,0.08)]"
        >
          <ListIcon size={17} />
          {t('recipes.sectionIngredients')}
          <span className="font-bold text-[#8C8A99]">{items.length}</span>
        </button>
        <button
          type="button"
          onClick={onOpenCookMode}
          disabled={!hasSteps}
          className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-[14px] bg-[#E8894A] text-base font-extrabold text-white shadow-[0_4px_14px_rgba(232,137,74,0.35)] disabled:opacity-50"
        >
          <PlayIcon size={15} />
          {t('cookMode.start')}
        </button>
      </div>
      <AnimatePresence>
        {ingredientsOpen && (
          <RecipeIngredientsSheet
            notice={allergenNotice}
            key="ingredients-sheet"
            {...checklist}
            servings={selectedServings}
            onDecreaseServings={onDecreaseServings}
            onIncreaseServings={onIncreaseServings}
            allAdded={allAdded}
            onAddAll={onAddAllIngredients}
            onToggleShoppingMode={toggleShoppingMode}
            onClose={() => setIngredientsOpen(false)}
          />
        )}
      </AnimatePresence>
      {share}
    </div>
  )
}

export default RecipeViewLayout
