import { useCallback } from 'react'
import { Linking } from 'react-native'
import { useRouter } from 'expo-router'
import type { IngredientLinkKind } from '@carrot/shared/types'

interface IngredientLinkParams {
  url: string | null
  kind: IngredientLinkKind | null
  linkedRecipeId: string | null
}

// A recipe link that isn't saved in Carrot yet opens as a website, so saving it stays the user's choice.
export const useIngredientLink = ({ url, kind, linkedRecipeId }: IngredientLinkParams) => {
  const router = useRouter()

  const isExternal = kind === 'external' || !linkedRecipeId

  const handlePress = useCallback(() => {
    if (!isExternal && linkedRecipeId) {
      router.navigate(`/recipe/${linkedRecipeId}`)
      return
    }
    if (url) void Linking.openURL(url)
  }, [isExternal, linkedRecipeId, router, url])

  return { isExternal, handlePress }
}
