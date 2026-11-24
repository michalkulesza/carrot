import { useCallback, useEffect, useState } from 'react'
import { AppState } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { useRouter } from 'expo-router'
import { isUnsupportedImportUrl } from '@carrot/shared/utils/importSource'
import { normalizeHttpUrl } from '../../components/AddRecipeDrawer/helpers'
import { useAddRecipeActions } from '../../components/AddRecipeDrawer/useAddRecipeActions'
import { usePersonalRecipesToLink } from '../../components/AddRecipeDrawer/usePersonalRecipesToLink'
import type { AddRecipeSheet } from '../../components/AddRecipeDrawer'

const useClipboardHasUrl = (isOpen: boolean) => {
  const [hasUrl, setHasUrl] = useState(false)

  const refresh = useCallback(() => {
    Clipboard.hasUrlAsync()
      .then(setHasUrl)
      .catch(() => setHasUrl(false))
  }, [])

  useEffect(() => {
    if (isOpen) refresh()
  }, [isOpen, refresh])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh()
    })

    return () => sub.remove()
  }, [refresh])

  return hasUrl
}

export const useAddMenu = (isOpen: boolean, onOpenSheet: (sheet: AddRecipeSheet) => void) => {
  const router = useRouter()
  const hasUrl = useClipboardHasUrl(isOpen)
  const { recipes: personalRecipes } = usePersonalRecipesToLink()
  const { importUrl, takePhoto, pickFromLibrary } = useAddRecipeActions()
  const hasPersonalRecipes = personalRecipes.length > 0

  const importClipboardLink = useCallback(async () => {
    const clipboardUrl = await Clipboard.getUrlAsync()
    const normalizedUrl = clipboardUrl ? normalizeHttpUrl(clipboardUrl) : null

    if (!normalizedUrl || isUnsupportedImportUrl(normalizedUrl)) {
      onOpenSheet('link')
      return
    }

    await importUrl(normalizedUrl)
  }, [importUrl, onOpenSheet])

  const openLinkSheet = useCallback(() => onOpenSheet('link'), [onOpenSheet])
  const openTextSheet = useCallback(() => onOpenSheet('text'), [onOpenSheet])
  const openPersonalLibrary = useCallback(() => onOpenSheet('personal-library'), [onOpenSheet])
  const writeFromScratch = useCallback(() => router.push('/new-recipe'), [router])
  const handleTakePhoto = useCallback(() => void takePhoto(), [takePhoto])
  const handlePickFromLibrary = useCallback(() => void pickFromLibrary(), [pickFromLibrary])
  const handleImportClipboardLink = useCallback(() => void importClipboardLink(), [importClipboardLink])

  return {
    hasUrl,
    hasPersonalRecipes,
    importClipboardLink: handleImportClipboardLink,
    openLinkSheet,
    openTextSheet,
    openPersonalLibrary,
    writeFromScratch,
    takePhoto: handleTakePhoto,
    pickFromLibrary: handlePickFromLibrary,
  }
}
