import { useCallback, useState } from 'react'
import { Plus, Search } from 'react-feather'
import { useTranslation } from 'react-i18next'
import {
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalHeader,
} from '@heroui/react'
import type { RecipeOut } from '@carrot/shared/types'
import RecipePickerItem from './RecipePickerItem'

interface RecipePickerModalProps {
  isOpen: boolean
  onClose: () => void
  hasRecipes: boolean
  filteredRecipes: RecipeOut[]
  searchQuery: string
  onSearchQueryChange: (query: string) => void
  busy: boolean
  onAddText: (text: string) => void
  onSelectRecipe: (recipe: RecipeOut) => void
}

const RecipePickerModal = ({
  isOpen,
  onClose,
  hasRecipes,
  filteredRecipes,
  searchQuery,
  onSearchQueryChange,
  busy,
  onAddText,
  onSelectRecipe,
}: RecipePickerModalProps) => {
  const { t } = useTranslation()
  const [plainText, setPlainText] = useState('')

  const handleAddText = useCallback(() => {
    const text = plainText.trim()
    if (!text) return

    setPlainText('')
    onAddText(text)
  }, [onAddText, plainText])

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) return

      setPlainText('')
      onClose()
    },
    [onClose]
  )

  return (
    <Modal isOpen={isOpen} onOpenChange={handleOpenChange}>
      <ModalBackdrop isDismissable>
        <ModalContainer
          scroll="inside"
          size="lg"
          className="!rounded-xl overflow-hidden"
        >
          <ModalDialog>
            <ModalHeader className="flex flex-col gap-3 pb-0">
              <span className="text-lg">{t('mealPlan.chooseDish')}</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder={t('mealPlan.quickEntryPlaceholder')}
                  value={plainText}
                  onChange={(event) => setPlainText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') handleAddText()
                  }}
                  maxLength={200}
                  aria-label={t('mealPlan.quickEntryPlaceholder')}
                  className="min-h-11 flex-1 rounded-lg bg-zinc-100 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button
                  type="button"
                  onClick={handleAddText}
                  disabled={!plainText.trim() || busy}
                  className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-45"
                >
                  <Plus size={16} aria-hidden="true" />
                  {t('mealPlan.addMeal')}
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 shrink-0 pointer-events-none" />
                <input
                  type="text"
                  placeholder={t('mealPlan.searchRecipes')}
                  value={searchQuery}
                  onChange={(e) => onSearchQueryChange(e.target.value)}
                  autoFocus
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </ModalHeader>
            <ModalBody className="pt-2 px-0">
              {!hasRecipes ? (
                <p className="text-center text-zinc-400 py-12 px-4">
                  {t('mealPlan.noRecipesYet')}
                </p>
              ) : filteredRecipes.length === 0 ? (
                <p className="text-center text-zinc-400 py-12">
                  {t('mealPlan.noRecipesMatch')}
                </p>
              ) : (
                <div>
                  {filteredRecipes.map((recipe) => (
                    <RecipePickerItem
                      key={recipe.id}
                      recipe={recipe}
                      disabled={busy}
                      onSelect={() => onSelectRecipe(recipe)}
                    />
                  ))}
                </div>
              )}
            </ModalBody>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  )
}

export default RecipePickerModal
