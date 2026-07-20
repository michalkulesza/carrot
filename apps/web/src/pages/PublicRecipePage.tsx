import { useCallback, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { addPublicRecipeToLibrary, fetchPublicRecipe } from '../api/client'
import { scaleIngredientQuantity } from '@carrot/shared/utils/ingredientScaling'
import type { RecipeOut } from '@carrot/shared/types'

const safeSourceUrl = (value: string | null): string | null => {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch { return null }
}

interface PublicRecipePageProps { signedIn?: boolean; onAdded?: (recipe: RecipeOut) => Promise<void> }

const PublicRecipePage = ({ signedIn = false, onAdded }: PublicRecipePageProps) => {
  const { token = '' } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [servings, setServings] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const { data: recipe, isLoading, isError } = useQuery({ queryKey: ['public-recipe', token], queryFn: () => fetchPublicRecipe(token), retry: false, enabled: Boolean(token) })
  const scale = useMemo(() => recipe?.servings && servings ? servings / recipe.servings : 1, [recipe?.servings, servings])
  const sourceUrl = safeSourceUrl(recipe?.source_url ?? null)
  const allergens = useMemo(() => [...new Set(recipe?.components.flatMap(component => component.ingredient_flags?.flatMap(flag => flag.allergen ? [flag.allergen] : []) ?? []) ?? [])], [recipe?.components])
  const handleAdd = useCallback(async () => {
    if (adding) return
    setAdding(true)
    try { const added = await addPublicRecipeToLibrary(token); if (onAdded) await onAdded(added); else navigate(`/?recipe=${added.id}`) } finally { setAdding(false) }
  }, [adding, navigate, onAdded, token])
  if (!token) return <main className="min-h-screen grid place-items-center p-6 text-center"><div><h1 className="text-3xl font-bold text-primary">Carrot</h1><p className="mt-3 text-zinc-600">{t('publicShare.marketing')}</p></div></main>
  if (isLoading) return <div className="min-h-screen grid place-items-center">{t('common.loading')}</div>
  if (isError || !recipe) return <div className="min-h-screen grid place-items-center p-6 text-center">{t('publicShare.unavailable')}</div>
  const displayedServings = servings ?? recipe.servings
  return <main className="mx-auto min-h-screen max-w-3xl bg-white p-5 md:p-10">
    {!signedIn && <header className="mb-8 flex items-center justify-between gap-3 border-b pb-4"><Link to="/marketing" className="text-xl font-bold text-primary">Carrot</Link><nav className="flex gap-3 text-sm"><Link to="/marketing">{t('publicShare.about')}</Link><Link to="/login">{t('publicShare.login')}</Link><Link className="rounded bg-primary px-3 py-2 text-primary-foreground" to="/register">{t('publicShare.register')}</Link></nav></header>}
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-bold">{recipe.title}</h1><div className="mt-3 flex flex-wrap gap-2">{recipe.tags.map(tag => <span key={`${tag.category}-${tag.name}`} className="rounded bg-zinc-100 px-2 py-1 text-xs">{tag.name}</span>)}{allergens.map(allergen => <span key={allergen} className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">⚠ {allergen}</span>)}</div></div>{signedIn && <button type="button" disabled={adding} onClick={handleAdd} className="rounded bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-60">{adding ? t('common.loading') : t('publicShare.addToLibrary')}</button>}</div>
    {recipe.thumbnail_url && <img src={recipe.thumbnail_url} alt="" className="my-6 h-64 w-full rounded-xl object-cover" />}
    <div className="my-6 flex flex-wrap gap-4 text-sm text-zinc-600"><span>{recipe.total_time_minutes ? t('publicShare.minutes', { count: recipe.total_time_minutes }) : ''}</span><span>{recipe.kcal_per_serving ? `${recipe.kcal_per_serving} kcal` : ''}</span>{recipe.servings && <label>{t('recipes.servings_other', { count: displayedServings ?? recipe.servings })}<input aria-label={t('publicShare.servings')} className="ml-2 w-16 rounded border p-1" type="number" min="1" value={displayedServings ?? ''} onChange={e => setServings(Number(e.target.value) || recipe.servings)} /></label>}</div>
    <section className="grid grid-cols-4 gap-3"><div className="rounded bg-zinc-100 p-3 text-center">{recipe.kcal_per_serving ?? '—'} kcal</div>{['Protein', 'Fat', 'Carbs'].map(label => <div key={label} title={t('publicShare.premiumNutrition')} className="rounded bg-zinc-100 p-3 text-center blur-sm" aria-label={t('publicShare.premiumNutrition')}>00 g</div>)}</section>
    {recipe.components.map((component, index) => <section key={`${component.name}-${index}`} className="mt-8"><h2 className="text-xl font-semibold">{component.name || t('recipes.sectionIngredients')}</h2><ul className="mt-3 list-disc space-y-1 pl-5">{component.ingredients.map((ingredient, ingredientIndex) => <li key={ingredientIndex}>{scaleIngredientQuantity(ingredient, scale)}</li>)}</ul><ol className="mt-5 list-decimal space-y-3 pl-5">{component.steps.map((step, stepIndex) => <li key={stepIndex}>{step}</li>)}</ol></section>)}
    {sourceUrl && <a href={sourceUrl} target="_blank" rel="noreferrer" className="mt-8 inline-block text-primary underline">{t('publicShare.source')}</a>}
  </main>
}
export default PublicRecipePage
