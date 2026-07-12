import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Linking,
  Platform,
  PlatformColor,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import * as Clipboard from 'expo-clipboard'
import * as Haptics from 'expo-haptics'
import * as ImagePicker from 'expo-image-picker'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigation, useLocalSearchParams, useRouter } from 'expo-router'
import { useApiClient } from '@carrot/shared/api/context'
import { useNotificationHistory } from '../../context/NotificationHistoryContext'
import { useHousehold } from '../../context/HouseholdContext'
import { useTags } from '@carrot/shared/hooks/useTags'
import { usePreferences } from '@carrot/shared/hooks/usePreferences'
import type { ImportJobKind, ImportResult, StageEvent, Tag } from '@carrot/shared/types'
import type { EditableRecipe, ImportMode } from './helpers'
import { STAGE_PROGRESS, blankRecipe, buildRecipeSavePayload, toEditable } from './helpers'
import { useHighDemandJob } from './useHighDemandJob'
import ActionBar from './ActionBar'
import MethodPickerView from './MethodPickerView'
import QuickUrlInputRow from './QuickUrlInputRow'
import RecipeFormView from './RecipeFormView'
import RecipeImportSkeleton from './RecipeImportSkeleton'
import ShareView from './ShareView'
import TextPasteView from './TextPasteView'
import UrlInputView from './UrlInputView'
import { useImportRecipeHeader } from './useImportRecipeHeader'
import { styles } from './styles'

const ImportRecipeScreen = () => {
  const { type: sharedTypeParam, value: sharedValueParam } = useLocalSearchParams<{ type?: string; value?: string }>()
  const navigation = useNavigation()
  const router = useRouter()
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const api = useApiClient()
  const qc = useQueryClient()
  const { push: pushNotif } = useNotificationHistory()
  const { tags, create: createTagMutation } = useTags()
  const { preferences } = usePreferences()
  const { activeHouseholdId } = useHousehold()

  const [mode, setMode] = useState<ImportMode | null>(null)
  const [url, setUrl] = useState('')
  const [pastedText, setPastedText] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const progressAnim = useRef(new Animated.Value(0)).current
  const [editable, setEditable] = useState<EditableRecipe | null>(null)
  const [previewMode, setPreviewMode] = useState(false)
  const [selectedTags, setSelectedTags] = useState<Tag[]>([])
  const [error, setError] = useState<string | null>(null)
  const cancelRef = useRef<(() => void) | null>(null)
  const skipGuardRef = useRef(false)
  const pendingThumbRef = useRef<string | null>(null)
  const highDemandJobRef = useRef<{ kind: ImportJobKind; input: Record<string, string> } | null>(null)
  const highDemandOfferedRef = useRef(false)
  // True once the foreground stream has resolved (success or error) — guards against
  // offering/accepting a background job for an import that already finished on its own.
  const streamDoneRef = useRef(false)

  const activeAllergens = useMemo(() => {
    const p = preferences?.personal_allergens
    return p ? [...(p.predefined ?? []), ...(p.custom ?? [])] : []
  }, [preferences])

  const autoSubstitute = preferences?.auto_substitute ?? false

  useEffect(() => () => { cancelRef.current?.() }, [])

  useEffect(() => {
    if (!sharedTypeParam || !sharedValueParam || editable) return
    switch (sharedTypeParam) {
      case 'url':   setMode('share'); setUrl(sharedValueParam); break
      case 'text':  setMode('text'); setPastedText(sharedValueParam); break
      case 'image': setMode('gallery'); startImageImport(sharedValueParam, 'image/jpeg'); break
    }
  }, [sharedTypeParam, sharedValueParam])

  useEffect(() => {
    const handleUrl = ({ url: incomingUrl }: { url: string }) => {
      const trimmed = incomingUrl.trim()
      if (trimmed.startsWith('http') && !editable) {
        setMode('url')
        setUrl(trimmed)
      }
    }
    const sub = Linking.addEventListener('url', handleUrl)
    Linking.getInitialURL().then((initialUrl) => {
      if (initialUrl?.startsWith('http')) handleUrl({ url: initialUrl })
    })
    return () => sub.remove()
  }, [editable])

  const handlePasteUrl = useCallback(async () => {
    const text = await Clipboard.getStringAsync()
    if (text) setUrl(text.trim())
  }, [])

  const handlePasteText = useCallback(async () => {
    const text = await Clipboard.getStringAsync()
    if (text) setPastedText((prev) => (prev ? prev + '\n' + text : text))
  }, [])

  const reset = useCallback(() => {
    cancelRef.current?.()
    setLoading(false)
    progressAnim.setValue(0)
    setEditable(null)
    setPreviewMode(false)
    setSelectedTags([])
    setError(null)
    setUrl('')
    setPastedText('')
    pendingThumbRef.current = null
  }, [progressAnim])

  useImportRecipeHeader({
    navigation,
    mode,
    editable,
    previewMode,
    loading,
    t,
    reset,
    setMode,
    setPreviewMode,
  })

  const applyImportResult = (res: ImportResult) => {
    if (res.recipe) {
      const editableRecipe = toEditable(res, autoSubstitute)
      if (!editableRecipe.thumbnail_url && pendingThumbRef.current) {
        editableRecipe.thumbnail_url = pendingThumbRef.current
      }
      pendingThumbRef.current = null
      setEditable(editableRecipe)
      setPreviewMode(true)
      setSelectedTags(
        tags.filter((tag) =>
          editableRecipe.suggestedTagNames.some((name) => name.toLowerCase() === tag.name.toLowerCase()),
        ),
      )
    } else {
      const message =
        res.error === 'extraction_failed' || !res.error
          ? t('addRecipe.couldNotExtract')
          : res.error
      // Camera/gallery imports leave the user looking at a blank import screen with no
      // input to correct (unlike a URL/text typo), so a passive inline error is easy to
      // miss — surface it as an alert too.
      if (mode === 'camera' || mode === 'gallery') {
        Alert.alert(t('addRecipe.importFailed'), message)
      }
      setError(message)
    }
    setLoading(false)
  }

  const handleHighDemand = useHighDemandJob({
    api,
    router,
    t,
    pushNotif,
    highDemandJobRef,
    highDemandOfferedRef,
    streamDoneRef,
    cancelRef,
    skipGuardRef,
  })

  const startStreamCallbacks = () => ({
    onStage(stage: StageEvent) {
      console.log('[import] stage:', stage.key, '—', stage.label)
      const target = STAGE_PROGRESS[stage.key] ?? 0.5
      Animated.timing(progressAnim, { toValue: target, duration: 400, useNativeDriver: false }).start()
    },
    onDone(res: ImportResult) {
      console.log('[import] done:', res.stage, res.error ?? 'ok')
      streamDoneRef.current = true
      Animated.timing(progressAnim, { toValue: 1, duration: 300, useNativeDriver: false }).start()
      applyImportResult(res)
    },
    onError(msg: string) {
      console.log('[import] error:', msg)
      streamDoneRef.current = true
      setError(msg)
      setLoading(false)
    },
    onHighDemand() {
      console.log('[import] high demand — offering background job')
      void handleHighDemand()
    },
  })

  const handleImportUrl = useCallback(() => {
    if (!url.trim()) return
    cancelRef.current?.()
    highDemandJobRef.current = { kind: 'url', input: { url: url.trim() } }
    highDemandOfferedRef.current = false
    streamDoneRef.current = false
    progressAnim.setValue(0)
    setLoading(true)
    setError(null)
    setEditable(null)
    setSelectedTags([])
    cancelRef.current = api.streamImportFetch(url.trim(), startStreamCallbacks())
  }, [url, api, progressAnim])

  const handleQuickUrlImport = useCallback(() => {
    if (!url.trim()) return
    setMode('url')
    handleImportUrl()
  }, [url, handleImportUrl])

  const handleImportText = useCallback(() => {
    if (!pastedText.trim()) return
    cancelRef.current?.()
    highDemandJobRef.current = { kind: 'text', input: { text: pastedText.trim() } }
    highDemandOfferedRef.current = false
    streamDoneRef.current = false
    progressAnim.setValue(0)
    setLoading(true)
    setError(null)
    setEditable(null)
    setSelectedTags([])
    cancelRef.current = api.streamTextImportFetch(pastedText.trim(), startStreamCallbacks())
  }, [pastedText, api, progressAnim])

  const handleCamera = async () => {
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
      setMode(null)
      return
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      base64: true,
    })
    if (!result.canceled && result.assets[0]?.base64) {
      startImageImport(result.assets[0].base64, result.assets[0].mimeType ?? 'image/jpeg')
    } else if (result.canceled) {
      setMode(null)
    }
  }

  const handleGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      base64: true,
    })
    if (!result.canceled && result.assets[0]?.base64) {
      startImageImport(result.assets[0].base64, result.assets[0].mimeType ?? 'image/jpeg')
    } else if (result.canceled) {
      setMode(null)
    }
  }

  const startImageImport = (imageBase64: string, mimeType: string) => {
    cancelRef.current?.()
    highDemandJobRef.current = { kind: 'image', input: { image_base64: imageBase64, mime_type: mimeType } }
    highDemandOfferedRef.current = false
    streamDoneRef.current = false
    pendingThumbRef.current = `data:${mimeType};base64,${imageBase64}`
    progressAnim.setValue(0)
    setLoading(true)
    setError(null)
    setEditable(null)
    setSelectedTags([])
    cancelRef.current = api.streamImageImportFetch(imageBase64, mimeType, startStreamCallbacks())
  }

  const handleModeSelect = useCallback((selectedMode: ImportMode) => {
    reset()
    setMode(selectedMode)
    switch (selectedMode) {
      case 'camera':  handleCamera(); break
      case 'gallery': handleGallery(); break
      case 'scratch': setEditable(blankRecipe()); setPreviewMode(false); break
    }
  }, [reset])

  const handleSave = useCallback(async () => {
    if (!editable) return
    setSaving(true)
    setError(null)
    try {
      const sharedToPersonal = activeHouseholdId !== null && !!preferences?.share_imports_to_personal
      await api.saveRecipe(buildRecipeSavePayload(editable, selectedTags, sharedToPersonal))
      await qc.invalidateQueries({ queryKey: ['recipes'] })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      skipGuardRef.current = true
      router.back()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('addRecipe.failedToSave'))
    } finally {
      setSaving(false)
    }
  }, [editable, selectedTags, activeHouseholdId, preferences, api, qc, t, router])

  const handleTagCreate = useCallback(
    async (name: string): Promise<Tag> => createTagMutation.mutateAsync(name),
    [createTagMutation],
  )
  const handleTagAdd = useCallback((tag: Tag) => setSelectedTags((prev) => [...prev, tag]), [])
  const handleTagRemove = useCallback((id: string) => setSelectedTags((prev) => prev.filter((tag) => tag.id !== id)), [])
  const selectedTagIds = useMemo(() => new Set(selectedTags.map((tag) => tag.id)), [selectedTags])

  const showImportBtn = mode === 'url' && !loading && !editable
  const showImportShareBtn = mode === 'share' && !loading && !editable
  const showExtractBtn = mode === 'text' && !loading && !editable

  const handleDiscard = useCallback(() => { reset(); setMode(null) }, [reset])

  return (
    <KeyboardAvoidingView
      style={[styles.flex, styles.screenBackground]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={88}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        contentInsetAdjustmentBehavior={editable ? 'never' : 'automatic'}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!(loading && !editable)}
      >
        {!mode && !editable && (
          <>
            <QuickUrlInputRow
              url={url}
              onUrlChange={setUrl}
              onPaste={handlePasteUrl}
              onImport={handleQuickUrlImport}
            />
            <MethodPickerView onSelect={handleModeSelect} />
          </>
        )}

        {mode === 'url' && !editable && !loading && (
          <UrlInputView
            url={url}
            onUrlChange={setUrl}
            onPaste={handlePasteUrl}
            onImport={handleImportUrl}
          />
        )}

        {mode === 'text' && !editable && !loading && (
          <TextPasteView
            text={pastedText}
            onTextChange={setPastedText}
            onPaste={handlePasteText}
          />
        )}

        {mode === 'share' && !editable && !loading && (
          <ShareView
            url={url}
            onUrlChange={setUrl}
            onPaste={handlePasteUrl}
            onImport={handleImportUrl}
          />
        )}

        {/* Native image picker hasn't returned yet — brief wait before the import stream starts */}
        {(mode === 'camera' || mode === 'gallery') && !editable && !loading && (
          <View style={styles.imageLoadingSection}>
            <Ionicons name="image" size={80} color={PlatformColor('tertiaryLabel') as unknown as string} />
          </View>
        )}

        {loading && !editable && <RecipeImportSkeleton progress={progressAnim} />}

        {editable && (
          <RecipeFormView
            recipe={editable}
            editing={!previewMode}
            onChange={setEditable}
            selectedTags={selectedTags}
            selectedTagIds={selectedTagIds}
            allTags={tags}
            onTagAdd={handleTagAdd}
            onTagRemove={handleTagRemove}
            onTagCreate={handleTagCreate}
            activeAllergens={activeAllergens}
          />
        )}

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>{t('addRecipe.importFailed')}</Text>
            <Text style={styles.errorMsg}>{error}</Text>
            {(mode === 'url' || mode === 'share') && url.trim() && (
              <Pressable
                style={({ pressed }) => [styles.openInBrowserBtn, pressed && { opacity: 0.7 }]}
                onPress={() => router.push({ pathname: '/webview-import', params: { url: url.trim() } })}
                accessibilityLabel={t('addRecipe.openInBrowser')}
              >
                <Text style={styles.openInBrowserText}>{t('addRecipe.openInBrowser')}</Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>

      <ActionBar
        editable={!!editable}
        showImportBtn={showImportBtn}
        showImportShareBtn={showImportShareBtn}
        showExtractBtn={showExtractBtn}
        saving={saving}
        loading={loading}
        url={url}
        pastedText={pastedText}
        bottomInset={insets.bottom}
        onDiscard={handleDiscard}
        onSave={handleSave}
        onImportUrl={handleImportUrl}
        onImportText={handleImportText}
      />
    </KeyboardAvoidingView>
  )
}

export default ImportRecipeScreen
