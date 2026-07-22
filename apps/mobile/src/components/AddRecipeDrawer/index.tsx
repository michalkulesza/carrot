import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Alert, Linking, PlatformColor, Pressable, Text, View } from 'react-native'
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetScrollView, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet'
import { useTranslation } from 'react-i18next'
import { Feather } from '@expo/vector-icons'
import * as Clipboard from 'expo-clipboard'
import * as ImagePicker from 'expo-image-picker'
import * as Haptics from 'expo-haptics'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
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
  presentTextImport: () => void
  dismiss: () => void
}

const SUBVIEW_TITLE_KEY: Record<Exclude<AddRecipeSubview, 'picker'>, string> = {
  text: 'addRecipe.methodText',
  'personal-library': 'addRecipe.fromPersonalLibrary',
}

// Fixed rather than dynamic so every subview renders at the same height instead of the
// sheet resizing as the user switches between the picker, text-paste, and library views.
const SNAP_POINTS = ['65%']

const isValidHttpUrl = (value: string) => {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

const AddRecipeDrawer = forwardRef<AddRecipeDrawerHandle>((_props, ref) => {
  const { t } = useTranslation()
  const router = useRouter()
  const insets = useSafeAreaInsets()
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
    presentTextImport: () => {
      setSubview('text')
      setError(null)
      sheetRef.current?.present()
    },
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
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    const text = await Clipboard.getStringAsync()
    if (text) setUrl(text.trim())
  }, [])

  const handlePasteText = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    const text = await Clipboard.getStringAsync()
    if (text) setPastedText((prev) => (prev ? prev + '\n' + text : text))
  }, [])

  const runEnqueue = useCallback(async (kind: 'url' | 'text' | 'image', input: Record<string, string>) => {
    setLoading(true)
    setError(null)
    try {
      await enqueueImport(api, qc, kind, input)
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      sheetRef.current?.dismiss()
    } catch (err) {
      const offline = err instanceof TypeError || (err instanceof Error && /network|offline|fetch/i.test(err.message))
      Alert.alert(t('common.whoops'), offline ? t('common.deviceOffline') : t('common.somethingWentWrong'))
    } finally {
      setLoading(false)
    }
  }, [api, qc, t])

  const handleImportUrl = useCallback(async () => {
    if (isValidHttpUrl(url.trim())) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      await runEnqueue('url', { url: url.trim() })
    }
  }, [runEnqueue, url])

  const handleExtractText = useCallback(async () => {
    if (pastedText.trim()) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      await runEnqueue('text', { text: pastedText.trim() })
    }
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

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setLinkingRecipeId(recipeId)
    setError(null)
    try {
      await api.linkRecipeToHousehold(recipeId, activeHouseholdId)
      await qc.invalidateQueries({ queryKey: ['recipes'] })
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      sheetRef.current?.dismiss()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('addRecipe.failedToAdd'))
    } finally {
      setLinkingRecipeId(null)
    }
  }, [activeHouseholdId, api, qc, t])

  const handleBackToPicker = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setSubview('picker')
    setError(null)
  }, [])

  const handleOpenInBrowser = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    sheetRef.current?.dismiss()
    router.push({ pathname: '/webview-import', params: { url: url.trim() } })
  }, [router, url])

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
    ),
    [],
  )

  const subviewHeader = subview !== 'picker' && (
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
  )

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={SNAP_POINTS}
      enableDynamicSizing={false}
      enablePanDownToClose
      topInset={insets.top}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.sheetBackground}
      handleIndicatorStyle={styles.sheetHandle}
      onDismiss={reset}
    >
      {subview === 'personal-library' ? (
        <PersonalRecipePickerView
          recipes={personalRecipes}
          isLoading={isLoadingPersonalRecipes}
          linkingRecipeId={linkingRecipeId}
          onSelect={handlePersonalRecipeSelect}
          header={subviewHeader}
          error={null}
        />
      ) : (
        <BottomSheetScrollView style={styles.container} keyboardShouldPersistTaps="handled">
          {subviewHeader}

          {subview === 'picker' && (
            <>
              <QuickUrlInputRow
                url={url}
                onUrlChange={setUrl}
                onPaste={handlePasteUrl}
                onImport={handleImportUrl}
                loading={loading}
                canImport={isValidHttpUrl(url.trim())}
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

        </BottomSheetScrollView>
      )}
    </BottomSheetModal>
  )
})

AddRecipeDrawer.displayName = 'AddRecipeDrawer'

export default AddRecipeDrawer
