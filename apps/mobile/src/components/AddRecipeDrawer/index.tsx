import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Linking } from 'react-native'
import type { BottomSheetModal } from '@gorhom/bottom-sheet'
import { AppSheet } from '../ui/sheet'
import * as Clipboard from 'expo-clipboard'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { isUnsupportedImportUrl } from '@carrot/shared/utils/importSource'
import { lightHaptic } from '../ui/haptics'
import { normalizeHttpUrl } from './helpers'
import { useAddRecipeActions } from './useAddRecipeActions'
import { usePersonalRecipesToLink } from './usePersonalRecipesToLink'
import LinkSheet from './LinkSheet'
import TextSheet from './TextSheet'
import PersonalRecipePickerView from './PersonalRecipePickerView'

export type AddRecipeSheet = 'link' | 'text' | 'personal-library'

export interface AddRecipeDrawerHandle {
  present: (sheet: AddRecipeSheet, opts?: { url?: string }) => void
  dismiss: () => void
}

const SNAP_POINTS = [560]

interface PresentRequest {
  sheet: AddRecipeSheet
}

const AddRecipeDrawer = forwardRef<AddRecipeDrawerHandle>((_props, ref) => {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { recipes: personalRecipes, isLoading: isLoadingPersonalRecipes } = usePersonalRecipesToLink()
  const { loading, linkingRecipeId, importUrl, importText, linkPersonalRecipe } = useAddRecipeActions()

  const sheetRef = useRef<BottomSheetModal>(null)
  const [request, setRequest] = useState<PresentRequest | null>(null)
  const [url, setUrl] = useState('')
  const [pastedText, setPastedText] = useState('')

  const sheet = request?.sheet ?? 'link'
  const normalizedUrl = useMemo(() => normalizeHttpUrl(url), [url])
  const isUnsupported = useMemo(() => normalizedUrl !== null && isUnsupportedImportUrl(normalizedUrl), [normalizedUrl])

  useEffect(() => {
    if (request) sheetRef.current?.present()
  }, [request])

  const present = useCallback((nextSheet: AddRecipeSheet, opts?: { url?: string }) => {
    if (opts?.url) setUrl(opts.url)
    setRequest({ sheet: nextSheet })
  }, [])

  const dismiss = useCallback(() => sheetRef.current?.dismiss(), [])

  useImperativeHandle(ref, () => ({ present, dismiss }), [present, dismiss])

  useEffect(() => {
    const handleUrl = ({ url: incomingUrl }: { url: string }) => {
      const trimmed = incomingUrl.trim()
      if (trimmed.startsWith('http')) present('link', { url: trimmed })
    }
    const sub = Linking.addEventListener('url', handleUrl)
    Linking.getInitialURL().then((initialUrl) => {
      if (initialUrl?.startsWith('http')) handleUrl({ url: initialUrl })
    })

    return () => sub.remove()
  }, [present])

  const handleDismiss = useCallback(() => {
    setRequest(null)
    setUrl('')
    setPastedText('')
  }, [])

  const handlePasteUrl = useCallback(async () => {
    const text = await Clipboard.getStringAsync()
    if (text) setUrl(text.trim())
  }, [])

  const handlePasteText = useCallback(async () => {
    const text = await Clipboard.getStringAsync()
    if (text) setPastedText((prev) => (prev ? `${prev}\n${text}` : text))
  }, [])

  const handleImportUrl = useCallback(async () => {
    if (!normalizedUrl || isUnsupported) return

    if (await importUrl(normalizedUrl)) dismiss()
  }, [normalizedUrl, isUnsupported, importUrl, dismiss])

  const handleImportText = useCallback(async () => {
    if (await importText(pastedText)) dismiss()
  }, [importText, pastedText, dismiss])

  const handlePersonalRecipeSelect = useCallback(
    async (recipeId: string) => {
      lightHaptic()
      if (await linkPersonalRecipe(recipeId)) dismiss()
    },
    [linkPersonalRecipe, dismiss],
  )

  const handleOpenInBrowser = useCallback(() => {
    dismiss()
    router.push({ pathname: '/webview-import', params: { url: url.trim() } })
  }, [dismiss, router, url])


  return (
    <AppSheet
      ref={sheetRef}
      snapPoints={SNAP_POINTS}
      enableDynamicSizing={false}
      topInset={insets.top}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      onDismiss={handleDismiss}
    >
      {sheet === 'link' ? (
        <LinkSheet
          url={url}
          normalizedUrl={normalizedUrl}
          isUnsupported={isUnsupported}
          loading={loading}
          onUrlChange={setUrl}
          onPaste={handlePasteUrl}
          onImport={handleImportUrl}
          onOpenInBrowser={handleOpenInBrowser}
        />
      ) : null}
      {sheet === 'text' ? (
        <TextSheet
          text={pastedText}
          loading={loading}
          onTextChange={setPastedText}
          onPaste={handlePasteText}
          onImport={handleImportText}
        />
      ) : null}
      {sheet === 'personal-library' ? (
        <PersonalRecipePickerView
          recipes={personalRecipes}
          isLoading={isLoadingPersonalRecipes}
          linkingRecipeId={linkingRecipeId}
          onSelect={handlePersonalRecipeSelect}
        />
      ) : null}
    </AppSheet>
  )
})

AddRecipeDrawer.displayName = 'AddRecipeDrawer'

export default AddRecipeDrawer
