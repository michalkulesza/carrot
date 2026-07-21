import { useCallback, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Modal, ModalBackdrop, ModalBody, ModalContainer, ModalDialog } from '@heroui/react'
import type { HouseholdOut, RecipeOut } from '@carrot/shared/types'
import { addPublicRecipeToLibrary, fetchPublicRecipe } from '../api/client'
import PublicRecipeDetailContent from '../components/RecipeDetailModal/PublicRecipeDetailContent'

interface PublicRecipePageProps {
  signedIn?: boolean
  households?: HouseholdOut[]
  activeHouseholdId?: string | null
  onAdded?: (recipe: RecipeOut) => Promise<void>
  onClose?: () => void
}

const PublicRecipePage = ({ signedIn = false, households = [], activeHouseholdId = null, onAdded, onClose }: PublicRecipePageProps) => {
  const { token = '' } = useParams()
  const { t } = useTranslation()
  const [adding, setAdding] = useState(false)
  const [householdId, setHouseholdId] = useState<string | null>(activeHouseholdId)
  const { data: recipe, isLoading, isError } = useQuery({ queryKey: ['public-recipe', token], queryFn: () => fetchPublicRecipe(token), retry: false, enabled: Boolean(token) })
  const handleAdd = useCallback(async () => {
    if (adding) return
    setAdding(true)
    try { const added = await addPublicRecipeToLibrary(token, householdId); await onAdded?.(added) } finally { setAdding(false) }
  }, [adding, householdId, onAdded, token])

  if (!token) return <main className="min-h-screen grid place-items-center p-6 text-center"><div><h1 className="text-3xl font-bold text-primary">Carrot</h1><p className="mt-3 text-zinc-600">{t('publicShare.marketing')}</p></div></main>
  if (isLoading) return <div className="min-h-screen grid place-items-center">{t('common.loading')}</div>
  if (isError || !recipe) return <div className="min-h-screen grid place-items-center p-6 text-center">{t('publicShare.unavailable')}</div>
  const needsHouseholdChoice = signedIn && households.length > 0
  const primaryAction = signedIn && !needsHouseholdChoice
    ? { label: adding ? t('common.loading') : t('publicShare.addToLibrary'), onClick: () => void handleAdd(), disabled: adding }
    : !signedIn ? { label: `${t('publicShare.login')} — ${t('publicShare.addToLibrary')}`, onClick: () => window.open(`/login?next=${encodeURIComponent(`/r/${token}`)}`, '_blank', 'noopener,noreferrer'), disabled: false } : undefined
  const householdAction = needsHouseholdChoice ? <div className="my-4 flex gap-3"><select value={householdId ?? ''} onChange={event => setHouseholdId(event.target.value || null)} className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"><option value="">{t('nav.personalLibrary')}</option>{households.map(household => <option key={household.id} value={household.id}>{household.name}</option>)}</select><button type="button" disabled={adding} onClick={() => void handleAdd()} className="shrink-0 cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:cursor-default disabled:opacity-60">{adding ? t('common.loading') : t('publicShare.addToLibrary')}</button></div> : undefined
  const publicHeader = !signedIn && <header className="sticky top-0 z-20 flex items-center justify-between border-b border-zinc-100 bg-white px-5 py-4 md:px-8"><Link to="/marketing" target="_blank" rel="noreferrer" className="flex items-center gap-2"><img src="/favicon.svg" alt="" className="h-7 w-7 rounded-lg" /><span className="text-lg font-bold tracking-tight">Carrot</span></Link><Link to="/register" target="_blank" rel="noreferrer" className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:brightness-95">{t('publicShare.register')}</Link></header>
  const content = <article className="bg-white">{publicHeader}<PublicRecipeDetailContent recipe={recipe} token={token} primaryAction={primaryAction} primaryActionContent={householdAction} /></article>
  if (!signedIn) return <main className="w-full md:my-2 md:rounded-xl md:shadow-sm">{content}</main>
  return <Modal isOpen onOpenChange={(open) => { if (!open) onClose?.() }}><ModalBackdrop isDismissable><ModalContainer size="lg" scroll="inside" className="!rounded-xl overflow-hidden"><ModalDialog className="!max-w-[712px] !p-0 max-h-[calc(100dvh-2rem)] sm:max-h-[1000px] rounded-xl"><ModalBody className="!p-0">{content}</ModalBody></ModalDialog></ModalContainer></ModalBackdrop></Modal>
}

export default PublicRecipePage
