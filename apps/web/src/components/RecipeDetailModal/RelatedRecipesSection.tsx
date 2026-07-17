import { useMemo, useState } from 'react'
import { Plus, X } from 'react-feather'
import { useTranslation } from 'react-i18next'
import { useRecipes } from '@carrot/shared/hooks/useRecipes'
import { useRelatedRecipes } from '@carrot/shared/hooks/useRelatedRecipes'
import { proxyUrl } from '../../utils/imageUtils'

const RelatedRecipesSection = ({ recipeId, onOpen }: { recipeId: string; onOpen: (id: string) => void }) => {
  const { t } = useTranslation()
  const { recipes } = useRecipes()
  const { relatedRecipes, save } = useRelatedRecipes(recipeId)
  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const openPicker = () => { setSelected(relatedRecipes.map((recipe) => recipe.id)); setEditing(true) }
  const candidates = useMemo(() => recipes.filter((recipe) => recipe.id !== recipeId), [recipeId, recipes])
  return <section className="mb-5"><p className="text-xs font-semibold uppercase text-zinc-400 mb-2">{t('relatedRecipes.title')}</p>
    <div className="flex gap-3 overflow-x-auto pb-1">{relatedRecipes.map((recipe) => <div key={recipe.id} className="w-28 shrink-0 relative"><button type="button" onClick={() => onOpen(recipe.id)} className="w-full text-left"><img src={proxyUrl(recipe.thumbnail_url) ?? undefined} className="h-16 w-28 rounded-lg object-cover bg-zinc-100" alt="" /><p className="truncate text-xs mt-1">{recipe.title}</p></button><button type="button" disabled={save.isPending} onClick={() => void save.mutateAsync(relatedRecipes.filter((item) => item.id !== recipe.id).map((item) => item.id))} className="absolute right-1 top-1 rounded-full bg-black/50 text-white p-1 disabled:opacity-50"><X size={12} /></button></div>)}
      <button type="button" onClick={openPicker} className="w-20 h-16 shrink-0 rounded-lg border border-dashed border-zinc-300 flex flex-col items-center justify-center text-primary"><Plus size={20}/><span className="text-xs">{t('common.add')}</span></button></div>
    {editing && <div className="mt-3 rounded-lg border border-zinc-200 p-3"><div className="max-h-44 overflow-y-auto space-y-2">{candidates.map((recipe) => <label key={recipe.id} className="flex gap-2 text-sm"><input type="checkbox" checked={selected.includes(recipe.id)} onChange={() => setSelected((ids) => ids.includes(recipe.id) ? ids.filter((id) => id !== recipe.id) : [...ids, recipe.id])}/>{recipe.title}</label>)}</div><div className="flex justify-end gap-3 mt-3"><button type="button" onClick={() => setEditing(false)}>{t('common.cancel')}</button><button type="button" disabled={save.isPending} className="text-primary disabled:opacity-50" onClick={() => void save.mutateAsync(selected).then(() => setEditing(false))}>{t('common.done')}</button></div></div>}
  </section>
}
export default RelatedRecipesSection
