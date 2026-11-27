import { memo, useCallback, useMemo, useRef, useState } from 'react'
import { Alert } from 'react-native'
import * as Haptics from 'expo-haptics'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '@carrot/shared/api/context'
import { useRelatedRecipes } from '@carrot/shared/hooks/useRelatedRecipes'
import type { RecipeOut } from '@carrot/shared/types'
import RelatedRecipesView from './RelatedRecipesView'

interface RelatedRecipesSectionProps {
  recipeId: string
  editing?: boolean
}

const RelatedRecipesSection = ({ recipeId, editing = false }: RelatedRecipesSectionProps) => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const api = useApiClient()
  const { relatedRecipes, refetch } = useRelatedRecipes(recipeId)
  const isSavingRef = useRef(false)
  const [pendingRelatedRecipes, setPendingRelatedRecipes] = useState<RecipeOut[] | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const displayedRelatedRecipes = pendingRelatedRecipes ?? relatedRecipes
  const saveRequestIdRef = useRef(0)
  const queuedRelatedRecipesRef = useRef<RecipeOut[] | null>(null)
  const relatedQueryKey = useMemo(() => ['recipes', recipeId, 'related'] as const, [recipeId])

  const saveRelatedRecipes = useCallback(async (nextRelatedRecipes: RecipeOut[]): Promise<void> => {
    if (isSavingRef.current) {
      queuedRelatedRecipesRef.current = nextRelatedRecipes
      setPendingRelatedRecipes(nextRelatedRecipes)
      return
    }

    const requestId = ++saveRequestIdRef.current
    isSavingRef.current = true
    setPendingRelatedRecipes(nextRelatedRecipes)
    setIsSaving(true)

    try {
      const related = await api.setRelatedRecipes(recipeId, nextRelatedRecipes.map((recipe) => recipe.id))

      if (requestId !== saveRequestIdRef.current) return

      queryClient.setQueryData(relatedQueryKey, related)
      setPendingRelatedRecipes(related)
      void refetch()
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch {
      if (requestId !== saveRequestIdRef.current) return

      setPendingRelatedRecipes(null)
      void queryClient.invalidateQueries({ queryKey: relatedQueryKey })
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      Alert.alert(t('common.somethingWentWrong'), t('addRecipe.saveError'))
    } finally {
      if (requestId === saveRequestIdRef.current) {
        isSavingRef.current = false
        setIsSaving(false)
      }
    }

    const queued = queuedRelatedRecipesRef.current
    queuedRelatedRecipesRef.current = null
    if (queued) await saveRelatedRecipes(queued)
  }, [api, queryClient, recipeId, refetch, relatedQueryKey, t])

  const handleSave = useCallback((recipes: RecipeOut[]) => void saveRelatedRecipes(recipes), [saveRelatedRecipes])

  return (
    <RelatedRecipesView
      recipeId={recipeId}
      related={displayedRelatedRecipes}
      isSaving={isSaving}
      editing={editing}
      onSave={handleSave}
    />
  )
}

export default memo(RelatedRecipesSection)
