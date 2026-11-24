import { useCallback, useState } from 'react'
import { ActionSheetIOS, Alert, Linking } from 'react-native'
import { useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { useTranslation } from 'react-i18next'
import type { IngredientLinkKind, LinkedRecipeImportResult } from '@carrot/shared/types'
import { useLinkedRecipeImport } from '@carrot/shared/hooks/useLinkedRecipeImport'

interface IngredientLinkParams {
  recipeId: string
  url: string | null
  kind: IngredientLinkKind | null
  linkedRecipeId: string | null
}

export const useIngredientLink = ({ recipeId, url, kind, linkedRecipeId }: IngredientLinkParams) => {
  const { t } = useTranslation()
  const router = useRouter()
  const linkedRecipeImport = useLinkedRecipeImport(recipeId)
  const [importQueued, setImportQueued] = useState(false)

  const isExternal = kind === 'external'
  const isBusy = linkedRecipeImport.isPending || importQueued

  const handleImportSuccess = useCallback(
    (result: LinkedRecipeImportResult) => {
      if (result.recipe_id) {
        router.navigate(`/recipe/${result.recipe_id}`)
        return
      }
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      setImportQueued(true)
    },
    [router],
  )

  const handleImportError = useCallback(() => {
    Alert.alert(t('recipes.linkedImportFailed'))
  }, [t])

  const handleImport = useCallback(() => {
    if (!url || isBusy) return
    linkedRecipeImport.mutate(url, { onSuccess: handleImportSuccess, onError: handleImportError })
  }, [url, isBusy, linkedRecipeImport, handleImportSuccess, handleImportError])

  const handleActionSheetSelect = useCallback(
    (selectedIndex: number) => {
      if (selectedIndex === 0) handleImport()
      else if (selectedIndex === 1 && url) void Linking.openURL(url)
    },
    [handleImport, url],
  )

  const handlePress = useCallback(() => {
    if (isExternal) {
      if (url) void Linking.openURL(url)
      return
    }
    if (linkedRecipeId) {
      router.navigate(`/recipe/${linkedRecipeId}`)
      return
    }
    if (!url || isBusy) return
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [t('recipes.importLinkedRecipe'), t('recipes.openLinkedWebsite'), t('common.cancel')],
        cancelButtonIndex: 2,
      },
      handleActionSheetSelect,
    )
  }, [isExternal, url, linkedRecipeId, router, isBusy, t, handleActionSheetSelect])

  const fallbackLabel = isExternal
    ? t('recipes.openLink')
    : isBusy
      ? t('recipes.linkedImportQueued')
      : t('recipes.openLinkedRecipe')

  return { isExternal, isBusy, handlePress, fallbackLabel }
}
