import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRecipes } from '@carrot/shared/hooks/useRecipes'
import { useRelatedRecipes } from '@carrot/shared/hooks/useRelatedRecipes'
import PopupRelated from './PopupRelated'

interface PopupRelatedSectionProps {
  recipeId: string
  onOpen: (id: string) => void
  desktop: boolean
}

const PopupRelatedSection = ({
  recipeId,
  onOpen,
  desktop,
}: PopupRelatedSectionProps) => {
  const { t } = useTranslation()
  const { recipes } = useRecipes()
  const { relatedRecipes, save } = useRelatedRecipes(recipeId)
  const [picking, setPicking] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const candidates = useMemo(
    () => recipes.filter((recipe) => recipe.id !== recipeId),
    [recipeId, recipes]
  )

  const openPicker = () => {
    setSelected(relatedRecipes.map((recipe) => recipe.id))
    setPicking(true)
  }
  const toggle = (id: string) =>
    setSelected((ids) =>
      ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]
    )
  const handleDone = () => {
    if (save.isPending) return
    void save.mutateAsync(selected).then(() => setPicking(false))
  }

  return (
    <div className="flex flex-col gap-2">
      <PopupRelated
        items={relatedRecipes}
        onOpen={onOpen}
        onLink={openPicker}
        desktop={desktop}
      />
      {picking && (
        <div className="rounded-xl border border-[#ECEAF0] p-3">
          <div className="max-h-44 space-y-2 overflow-y-auto">
            {candidates.map((recipe) => (
              <label key={recipe.id} className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(recipe.id)}
                  onChange={() => toggle(recipe.id)}
                  className="accent-[#E8894A]"
                />
                {recipe.title}
              </label>
            ))}
          </div>
          <div className="mt-3 flex justify-end gap-3 text-sm font-bold">
            <button type="button" onClick={() => setPicking(false)}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              disabled={save.isPending}
              onClick={handleDone}
              className="text-[#E07B39] disabled:opacity-50"
            >
              {t('common.done')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default PopupRelatedSection
