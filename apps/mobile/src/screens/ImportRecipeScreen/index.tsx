import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
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
import { File } from 'expo-file-system'
import * as ImagePicker from 'expo-image-picker'
import { clearSharedPayloads, getSharedPayloads } from 'expo-sharing'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigation, useLocalSearchParams, useRouter } from 'expo-router'
import { useApiClient } from '@carrot/shared/api/context'
import { useHousehold } from '../../context/HouseholdContext'
import { useTags } from '@carrot/shared/hooks/useTags'
import { usePreferences } from '@carrot/shared/hooks/usePreferences'
import { usePersonalRecipes } from '@carrot/shared/hooks/useRecipes'
import type { ImportJob, Tag } from '@carrot/shared/types'
import type { EditableRecipe, ImportMode } from './helpers'
import { blankRecipe, buildRecipeSavePayload } from './helpers'
import ActionBar from './ActionBar'
import MethodPickerView from './MethodPickerView'
import PersonalRecipePickerView from './PersonalRecipePickerView'
import QuickUrlInputRow from './QuickUrlInputRow'
import RecipeFormView from './RecipeFormView'
import ShareView from './ShareView'
import TextPasteView from './TextPasteView'
import UrlInputView from './UrlInputView'
import { useImportRecipeHeader } from './useImportRecipeHeader'
import { styles } from './styles'
import { createUuid } from '../../utils/uuid'
import { setImportImagePreview } from '../../utils/importImagePreviews'
import { resolveRecipePreview } from '../../utils/recipePreview'

const ImportRecipeScreen = () => {
  const { type: sharedTypeParam, value: sharedValueParam, mimeType: sharedMimeTypeParam } = useLocalSearchParams<{
    type?: string
    value?: string
    mimeType?: string
  }>()
  const navigation = useNavigation()
  const router = useRouter()
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const api = useApiClient()
  const qc = useQueryClient()
  const { tags, create: createTagMutation } = useTags()
  const { preferences } = usePreferences()
  const { activeHouseholdId } = useHousehold()
  const {
    data: personalRecipes = [],
    isLoading: isLoadingPersonalRecipes,
  } = usePersonalRecipes(activeHouseholdId !== null)

  const [mode, setMode] = useState<ImportMode | null>(null)
  const [url, setUrl] = useState('')
  const [pastedText, setPastedText] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editable, setEditable] = useState<EditableRecipe | null>(null)
  const [previewMode, setPreviewMode] = useState(false)
  const [selectedTags, setSelectedTags] = useState<Tag[]>([])
  const [error, setError] = useState<string | null>(null)
  const [linkingRecipeId, setLinkingRecipeId] = useState<string | null>(null)
  const skipGuardRef = useRef(false)
  const sharedUrlImportRef = useRef<string | null>(null)

  const activeAllergens = useMemo(() => {
    const p = preferences?.personal_allergens
    return p ? [...(p.predefined ?? []), ...(p.custom ?? [])] : []
  }, [preferences])

  const autoSubstitute = preferences?.auto_substitute ?? false

  useEffect(() => {
    if (!sharedTypeParam || editable) return

    if (sharedTypeParam === 'image' && !sharedValueParam) {
      const payload = getSharedPayloads().find((item) => item.shareType === 'image')
      if (!payload) return

      const importSharedImage = async () => {
        try {
          const value = await new File(payload.value).base64()
          setMode('gallery')
          startImageImport(value, payload.mimeType ?? 'image/jpeg')
        } finally {
          clearSharedPayloads()
        }
      }

      void importSharedImage()
      return
    }

    if (!sharedValueParam) return

    switch (sharedTypeParam) {
      case 'url':
        if (sharedUrlImportRef.current === sharedValueParam) return
        sharedUrlImportRef.current = sharedValueParam
        setMode('share')
        setUrl(sharedValueParam)
        void enqueue('url', { url: sharedValueParam })
        break
      case 'text': setMode('text'); setPastedText(sharedValueParam); break
      case 'image': setMode('gallery'); startImageImport(sharedValueParam, sharedMimeTypeParam ?? 'image/jpeg'); break
    }
  }, [sharedMimeTypeParam, sharedTypeParam, sharedValueParam])

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
    setLoading(false)
    setEditable(null)
    setPreviewMode(false)
    setSelectedTags([])
    setError(null)
    setUrl('')
    setPastedText('')
  }, [])

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

  const enqueue = useCallback(async (kind: 'url' | 'text' | 'image', input: Record<string, string>) => {
    setLoading(true)
    setError(null)
    try {
      const job = await api.enqueueImportJob({ kind, input, idempotency_key: createUuid() })
      if (kind === 'image') {
        const mimeType = input.mime_type ?? 'image/jpeg'
        const imageBase64 = input.image_base64
        if (imageBase64) setImportImagePreview(job.id, `data:${mimeType};base64,${imageBase64}`)
      }
      qc.setQueryData<ImportJob[]>(['importJobs'], (jobs = []) => [...jobs.filter((item) => item.id !== job.id), job])
      if (kind === 'url') {
        void resolveRecipePreview(input.url).then((previewUrl) => {
          if (!previewUrl) return
          setImportImagePreview(job.id, previewUrl)
          qc.setQueryData<ImportJob[]>(['importJobs'], (jobs = []) => [...jobs])
        })
      }
      router.replace('/(tabs)/recipes')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('importJobs.enqueueFailed'))
    } finally {
      setLoading(false)
    }
  }, [api, qc, router, t])

  const handleImportUrl = useCallback(() => {
    if (url.trim()) void enqueue('url', { url: url.trim() })
  }, [enqueue, url])

  const handleQuickUrlImport = useCallback(() => {
    if (!url.trim()) return
    setMode('url')
    handleImportUrl()
  }, [url, handleImportUrl])

  const handleImportText = useCallback(() => {
    if (!pastedText.trim()) return
    void enqueue('text', { text: pastedText.trim() })
  }, [enqueue, pastedText])

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

  const startImageImport = (imageBase64: string, mimeType: string) => void enqueue('image', { image_base64: imageBase64, mime_type: mimeType })

  const handleModeSelect = useCallback((selectedMode: ImportMode) => {
    reset()
    setMode(selectedMode)
    switch (selectedMode) {
      case 'camera':  handleCamera(); break
      case 'gallery': handleGallery(); break
      case 'scratch': setEditable(blankRecipe()); setPreviewMode(false); break
    }
  }, [reset])

  const handlePersonalRecipeSelect = useCallback(async (recipeId: string) => {
    if (!activeHouseholdId) return

    setLinkingRecipeId(recipeId)
    setError(null)
    try {
      await api.linkRecipeToHousehold(recipeId, activeHouseholdId)
      await qc.invalidateQueries({ queryKey: ['recipes'] })
      Alert.alert(t('addRecipe.recipeAddedToHousehold'), undefined, [
        { text: t('common.ok'), onPress: () => router.back() },
      ])
    } catch (err) {
      const message = err instanceof Error ? err.message : t('addRecipe.failedToAdd')
      setError(message)
      Alert.alert(t('addRecipe.failedToAdd'), message)
    } finally {
      setLinkingRecipeId(null)
    }
  }, [activeHouseholdId, api, qc, router, t])

  const handleSave = useCallback(async () => {
    if (!editable) return
    setSaving(true)
    setError(null)
    try {
      const sharedToPersonal = activeHouseholdId !== null && !!preferences?.share_imports_to_personal
      await api.saveRecipe(buildRecipeSavePayload(editable, selectedTags, sharedToPersonal))
      await qc.invalidateQueries({ queryKey: ['recipes'] })
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

  if (mode === 'personal-library') {
    return (
      <KeyboardAvoidingView
        style={[styles.flex, styles.screenBackground]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <PersonalRecipePickerView
          recipes={personalRecipes}
          isLoading={isLoadingPersonalRecipes}
          linkingRecipeId={linkingRecipeId}
          onSelect={handlePersonalRecipeSelect}
        />
      </KeyboardAvoidingView>
    )
  }

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
            <MethodPickerView
              showPersonalLibrary={activeHouseholdId !== null}
              onSelect={handleModeSelect}
            />
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
