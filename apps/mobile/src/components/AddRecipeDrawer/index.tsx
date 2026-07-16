import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Alert, Linking, PlatformColor, Pressable, Text, View } from 'react-native'
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetView, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet'
import { useTranslation } from 'react-i18next'
import { Feather } from '@expo/vector-icons'
import * as Clipboard from 'expo-clipboard'
import * as ImagePicker from 'expo-image-picker'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useApiClient } from '@carrot/shared/api/context'
import { usePersonalRecipes } from '@carrot/shared/hooks/useRecipes'
import { useHousehold } from '../../context/HouseholdContext'
import { enqueueImport } from '../../utils/enqueueImport'
import type { AddRecipeMethod, AddRecipeSubview } from './helpers'
import MethodPickerView from './MethodPickerView'
import QuickUrlInputRow from './QuickUrlInputRow'
import TextPasteView from './TextPasteView'
import PersonalRecipePickerView from './PersonalRecipePickerView'
import { styles } from './styles'

export interface AddRecipeDrawerHandle {
  present: () => void
  dismiss: () => void
}

const SUBVIEW_TITLE_KEY: Record<Exclude<AddRecipeSubview, 'picker'>, string> = {
  text: 'addRecipe.methodText',
  'personal-library': 'addRecipe.fromPersonalLibrary',
}

const AddRecipeDrawer = forwardRef<AddRecipeDrawerHandle>((_props, ref) => {
  const { t } = useTranslation()
  const router = useRouter()
  const api = useApiClient()
  const qc = useQueryClient()
  const { activeHouseholdId } = useHousehold()
  const {
    data: personalRecipes = [],
    isLoading: isLoadingPersonalRecipes,
  } = usePersonalRecipes(activeHouseholdId !== null)

  const sheetRef = useRef<BottomSheetModal>(null)
  const [subview, setSubview] = useState<AddRecipeSubview>('picker')
  const [url, setUrl] = useState('')
  const [pastedText, setPastedText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linkingRecipeId, setLinkingRecipeId] = useState<string | null>(null)

  const reset = useCallback(() => {
    setSubview('picker')
    setUrl('')
    setPastedText('')
    setLoading(false)
    setError(null)
    setLinkingRecipeId(null)
  }, [])

  useImperativeHandle(ref, () => ({
    present: () => sheetRef.current?.present(),
    dismiss: () => sheetRef.current?.dismiss(),
  }))

  // Lets an http(s) link opened while the app is running (or the app's cold-start URL)
  // populate the URL field, mirroring how a shared/tapped recipe link used to land on the old screen.
  useEffect(() => {
    const handleUrl = ({ url: incomingUrl }: { url: string }) => {
      const trimmed = incomingUrl.trim()
      if (!trimmed.startsWith('http')) return
      setUrl(trimmed)
      setSubview('picker')
      sheetRef.current?.present()
    }
    const sub = Linking.addEventListener('url', handleUrl)
    Linking.getInitialURL().then((initialUrl) => {
      if (initialUrl?.startsWith('http')) handleUrl({ url: initialUrl })
    })
    return () => sub.remove()
  }, [])

  const handlePasteUrl = useCallback(async () => {
    const text = await Clipboard.getStringAsync()
    if (text) setUrl(text.trim())
  }, [])

  const handlePasteText = useCallback(async () => {
    const text = await Clipboard.getStringAsync()
    if (text) setPastedText((prev) => (prev ? prev + '\n' + text : text))
  }, [])

  const runEnqueue = useCallback(async (kind: 'url' | 'text' | 'image', input: Record<string, string>) => {
    setLoading(true)
    setError(null)
    try {
      await enqueueImport(api, qc, kind, input)
      sheetRef.current?.dismiss()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('importJobs.enqueueFailed'))
    } finally {
      setLoading(false)
    }
  }, [api, qc, t])

  const handleImportUrl = useCallback(() => {
    if (url.trim()) void runEnqueue('url', { url: url.trim() })
  }, [runEnqueue, url])

  const handleExtractText = useCallback(() => {
    if (pastedText.trim()) void runEnqueue('text', { text: pastedText.trim() })
  }, [runEnqueue, pastedText])

  const handleCameraPick = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert(
        t('addRecipe.cameraPermissionDenied'),
        t('addRecipe.cameraPermissionDeniedMsg'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('addRecipe.openSettings'), onPress: () => Linking.openSettings() },
        ],
      )
      return
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7, base64: true })
    if (!result.canceled && result.assets[0]?.base64) {
      void runEnqueue('image', { image_base64: result.assets[0].base64, mime_type: result.assets[0].mimeType ?? 'image/jpeg' })
    }
  }, [runEnqueue, t])

  const handleGalleryPick = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, base64: true })
    if (!result.canceled && result.assets[0]?.base64) {
      void runEnqueue('image', { image_base64: result.assets[0].base64, mime_type: result.assets[0].mimeType ?? 'image/jpeg' })
    }
  }, [runEnqueue])

  const handleMethodSelect = useCallback((method: AddRecipeMethod) => {
    switch (method) {
      case 'camera':
        sheetRef.current?.dismiss()
        void handleCameraPick()
        break
      case 'gallery':
        sheetRef.current?.dismiss()
        void handleGalleryPick()
        break
      case 'text':
        setSubview('text')
        break
      case 'personal-library':
        setSubview('personal-library')
        break
      case 'scratch':
        sheetRef.current?.dismiss()
        router.push('/new-recipe')
        break
    }
  }, [handleCameraPick, handleGalleryPick, router])

  const handlePersonalRecipeSelect = useCallback(async (recipeId: string) => {
    if (!activeHouseholdId) return

    setLinkingRecipeId(recipeId)
    setError(null)
    try {
      await api.linkRecipeToHousehold(recipeId, activeHouseholdId)
      await qc.invalidateQueries({ queryKey: ['recipes'] })
      sheetRef.current?.dismiss()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('addRecipe.failedToAdd'))
    } finally {
      setLinkingRecipeId(null)
    }
  }, [activeHouseholdId, api, qc, t])

  const handleBackToPicker = useCallback(() => {
    setSubview('picker')
    setError(null)
  }, [])

  const handleOpenInBrowser = useCallback(() => {
    sheetRef.current?.dismiss()
    router.push({ pathname: '/webview-import', params: { url: url.trim() } })
  }, [router, url])

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
    ),
    [],
  )

  return (
    <BottomSheetModal
      ref={sheetRef}
      enableDynamicSizing
      enablePanDownToClose
      keyboardBehavior="extend"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.sheetBackground}
      handleIndicatorStyle={styles.sheetHandle}
      onDismiss={reset}
    >
      <BottomSheetView style={styles.container}>
        {subview !== 'picker' && (
          <View style={styles.subviewHeader}>
            <Pressable
              onPress={handleBackToPicker}
              hitSlop={8}
              style={({ pressed }) => [styles.subviewBackBtn, pressed && { opacity: 0.5 }]}
              accessibilityLabel={t('common.back')}
            >
              <Feather name="chevron-left" size={22} color={PlatformColor('systemBlue') as unknown as string} />
              <Text style={styles.subviewBackText}>{t('common.back')}</Text>
            </Pressable>
            <Text style={styles.subviewTitle}>{t(SUBVIEW_TITLE_KEY[subview])}</Text>
          </View>
        )}

        {subview === 'picker' && (
          <>
            <QuickUrlInputRow
              url={url}
              onUrlChange={setUrl}
              onPaste={handlePasteUrl}
              onImport={handleImportUrl}
              loading={loading}
            />
            <MethodPickerView
              showPersonalLibrary={activeHouseholdId !== null}
              onSelect={handleMethodSelect}
            />
          </>
        )}

        {subview === 'text' && (
          <TextPasteView
            text={pastedText}
            onTextChange={setPastedText}
            onPaste={handlePasteText}
            onExtract={handleExtractText}
            loading={loading}
          />
        )}

        {subview === 'personal-library' && (
          <PersonalRecipePickerView
            recipes={personalRecipes}
            isLoading={isLoadingPersonalRecipes}
            linkingRecipeId={linkingRecipeId}
            onSelect={handlePersonalRecipeSelect}
          />
        )}

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>{t('addRecipe.importFailed')}</Text>
            <Text style={styles.errorMsg}>{error}</Text>
            {subview === 'picker' && url.trim() && (
              <Pressable
                style={({ pressed }) => [styles.openInBrowserBtn, pressed && { opacity: 0.7 }]}
                onPress={handleOpenInBrowser}
                accessibilityLabel={t('addRecipe.openInBrowser')}
              >
                <Text style={styles.openInBrowserText}>{t('addRecipe.openInBrowser')}</Text>
              </Pressable>
            )}
          </View>
        )}
      </BottomSheetView>
    </BottomSheetModal>
  )
})

AddRecipeDrawer.displayName = 'AddRecipeDrawer'

export default AddRecipeDrawer
