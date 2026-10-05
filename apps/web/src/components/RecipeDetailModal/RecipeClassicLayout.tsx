import type { ChangeEvent, ReactNode, RefObject } from 'react'
import { ModalBody, ModalFooter, ModalHeader } from '@heroui/react'
import type { RecipeOut } from '@carrot/shared/types'
import type { EditState, Mode } from './helpers'
import type { DraftTextField } from './useRecipeDraft'
import RecipeMetaBar from './RecipeMetaBar'
import RecipeNotesSection from './RecipeNotesSection'
import RecipeNotices from './RecipeNotices'
import RelatedRecipesSection from './RelatedRecipesSection'

interface RecipeClassicLayoutProps {
  recipe: RecipeOut
  draft: EditState
  mode: Mode
  error: string | null
  renderHero: (part: 'all' | 'image' | 'details') => ReactNode
  footer: ReactNode
  fileInputRef: RefObject<HTMLInputElement | null>
  onThumbnailFile: (event: ChangeEvent<HTMLInputElement>) => void
  onNutritionChange: (field: DraftTextField, value: string) => void
  wakeLockActive: boolean
  onToggleWakeLock: () => void
  fontSizeIndex: number
  onFontSizeChange: (index: number) => void
  onCancelMode: () => void
  selectedServings: number | null
  onDecreaseServings: () => void
  onIncreaseServings: () => void
  onOpenCookMode: () => void
  onOpenRecipe?: (id: string) => void
  notes: string
  onNotesChange: (value: string) => void
  onNotesBlur: () => void
  notesSaving: boolean
  children: ReactNode
}

const RecipeClassicLayout = ({
  recipe,
  draft,
  mode,
  error,
  renderHero,
  footer,
  fileInputRef,
  onThumbnailFile,
  onNutritionChange,
  wakeLockActive,
  onToggleWakeLock,
  fontSizeIndex,
  onFontSizeChange,
  onCancelMode,
  selectedServings,
  onDecreaseServings,
  onIncreaseServings,
  onOpenCookMode,
  onOpenRecipe,
  notes,
  onNotesChange,
  onNotesBlur,
  notesSaving,
  children,
}: RecipeClassicLayoutProps) => (
  <>
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={onThumbnailFile}
    />
    <ModalHeader className="flex-col gap-0 p-0">
      <div className="lg:hidden">{renderHero('all')}</div>
      <div className="hidden lg:block">{renderHero('image')}</div>
    </ModalHeader>

    <ModalBody className="!px-0 !pb-5 !pt-0">
      <div className="lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="min-w-0 lg:border-r lg:border-zinc-200 lg:px-8 lg:pb-8">
          <div className="hidden lg:block">{renderHero('details')}</div>
          <RecipeMetaBar
            recipe={recipe}
            draft={draft}
            mode={mode}
            onNutritionChange={onNutritionChange}
            wakeLockActive={wakeLockActive}
            onToggleWakeLock={onToggleWakeLock}
            fontSizeIndex={fontSizeIndex}
            onFontSizeChange={onFontSizeChange}
            onCancelMode={onCancelMode}
            selectedServings={selectedServings}
            onDecreaseServings={onDecreaseServings}
            onIncreaseServings={onIncreaseServings}
            onOpenCookMode={onOpenCookMode}
            twoColumn
          />

          <div className="px-10 lg:px-0">
            <RecipeNotices
              recipe={recipe}
              error={error}
              spacingClassName="mb-3"
            />
            <RelatedRecipesSection
              recipeId={recipe.id}
              onOpen={(id) => onOpenRecipe?.(id)}
            />
            <RecipeNotesSection
              value={notes}
              onChange={onNotesChange}
              onBlur={onNotesBlur}
              saving={notesSaving}
              fontSizeIndex={fontSizeIndex}
            />
          </div>
          <div className="hidden lg:block pt-5">{footer}</div>
        </div>

        <div className="min-w-0 px-10 lg:px-8 lg:pt-5">{children}</div>
      </div>
    </ModalBody>

    <ModalFooter className="flex-col gap-2 items-stretch px-10 pb-5 pt-3 lg:hidden">
      {footer}
    </ModalFooter>
  </>
)

export default RecipeClassicLayout
