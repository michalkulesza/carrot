import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Linking,
  Platform,
  PlatformColor,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Image } from 'expo-image'

import { useTranslation } from 'react-i18next'
import { Feather, Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as ImagePicker from 'expo-image-picker'
import * as KeepAwake from 'expo-keep-awake'
import * as Haptics from 'expo-haptics'
import { useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation, useLocalSearchParams } from 'expo-router'
import { useApiClient } from '@carrot/shared/api/context'
import { useRecipes } from '@carrot/shared/hooks/useRecipes'
import { useShoppingList } from '@carrot/shared/hooks/useShoppingList'
import { useTags } from '@carrot/shared/hooks/useTags'
import {
  parseDurationMatch,
  formatDurationLabel,
  useTimers,
  getRemainingSeconds,
  formatCountdown,
  type DurationMatch,
} from '../context/TimerContext'
import BellMenu from '../components/BellMenu'
import BugReportButton from '../components/BugReportButton'
import AddToMealPlanSheet, { type AddToMealPlanSheetHandle } from '../components/AddToMealPlanSheet'
import AddIngredientToShoppingListSheet, {
  type AddIngredientToShoppingListSheetHandle,
} from '../components/AddIngredientToShoppingListSheet'
import { UnitPickerModal, TagPickerModal, IngredientEditor } from '../components/RecipeFieldEditors'
import NutritionBoxGrid from '../components/NutritionBoxGrid'
import type { RecipeOut, SaveComponent, Ingredient, StepIngredientRef, Tag } from '@carrot/shared/types'
import { useDebugMode } from '../context/DebugModeContext'
import {
  displayIngredient,
  buildClientStepRefs,
  serializeIngredient,
  parseIngredient,
} from '@carrot/shared/utils/ingredientUtils'
import type { StructuredIngredient } from '@carrot/shared/utils/ingredientUtils'
import { tTag } from '@carrot/shared/utils/tagUtils'
import { colors } from '../theme/colors'
import { proxyThumbnailUrl, PLACEHOLDER_URL } from '../api/thumbnailUrl'
import { uploadThumbnailImage } from '../api/uploadThumbnail'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

const HERO_HEIGHT = Math.round(SCREEN_WIDTH * (3 / 4))

const extractDisplayUrl = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url.length > 40 ? url.slice(0, 40) + '…' : url
  }
}

const capitalizeFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// ── Edit draft ──────────────────────────────────────────────────────────────────

interface EditComponent {
  name: string
  yield_note: string
  ingredients: StructuredIngredient[]
  steps: string[]
}

interface EditDraft {
  title: string
  servings: string
  kcal: string
  protein: string
  fat: string
  carbs: string
  notes: string
  thumbnail_url: string | null
  components: EditComponent[]
}

const buildDraft = (recipe: RecipeOut): EditDraft => ({
  title: recipe.title,
  servings: recipe.servings?.toString() ?? '',
  kcal: recipe.kcal_per_serving?.toString() ?? '',
  protein: recipe.protein_per_serving?.toString() ?? '',
  fat: recipe.fat_per_serving?.toString() ?? '',
  carbs: recipe.carbs_per_serving?.toString() ?? '',
  notes: recipe.notes ?? '',
  thumbnail_url: recipe.thumbnail_url,
  components: recipe.components.map((c) => ({
    name: c.name ?? '',
    yield_note: c.yield_note ?? '',
    ingredients: (c.ingredients as Array<string | StructuredIngredient>).map((raw) =>
      typeof raw === 'string' ? parseIngredient(raw) : raw,
    ),
    steps: c.steps,
  })),
})

// ── Timer button for a step ────────────────────────────────────────────────────

const TimerSpan = ({
  timerId,
  recipe,
  componentIndex,
  stepIndex,
  stepText,
  seconds,
}: {
  timerId: string
  recipe: RecipeOut
  componentIndex: number
  stepIndex: number
  stepText: string
  seconds: number
}) => {
  const { t } = useTranslation()
  const { timers, startTimer, pauseTimer, resumeTimer } = useTimers()
  const timer = timers.get(timerId)
  const [, setTick] = useState(0)
  useEffect(() => {
    if (timer?.status !== 'running') return
    const id = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [timer?.status])

  if (!timer) {
    return (
      <Text
        style={styles.timerSpan}
        onPress={() =>
          startTimer({
            id: timerId,
            recipeId: recipe.id,
            recipeTitle: recipe.title,
            componentIndex,
            stepIndex,
            stepText,
            totalSeconds: seconds,
          })
        }
        accessibilityRole="button"
        accessibilityLabel={t('timers.startTimer')}
      >
        {`⏱ ${formatDurationLabel(seconds)}`}
      </Text>
    )
  }

  const remaining = getRemainingSeconds(timer)
  const isRunning = timer.status === 'running'
  const isDone = timer.status === 'done' || remaining === 0

  return (
    <Text
      style={[
        styles.timerSpan,
        { color: isDone ? '#10b981' : isRunning ? '#d97706' : colors.tertiaryLabel },
      ]}
      onPress={isDone ? undefined : () => (isRunning ? pauseTimer(timerId) : resumeTimer(timerId))}
      accessibilityRole="button"
      accessibilityLabel={isDone ? t('common.doneCheck') : isRunning ? t('common.pause') : t('common.resume')}
    >
      {isDone ? t('common.doneCheck') : `⏱ ${formatCountdown(remaining)}`}
    </Text>
  )
}

// ── Step text with tappable ingredient pills ───────────────────────────────────

type Segment =
  | { type: 'text'; text: string }
  | { type: 'mention'; text: string; ingredientIndex: number }
  | { type: 'timer'; seconds: number }

const buildSegments = (
  step: string,
  stepRefs: StepIngredientRef[],
  durationMatch: DurationMatch | null,
): Segment[] => {
  const spans: { start: number; end: number; seg: Segment }[] = []

  for (const ref of stepRefs) {
    let idx = 0
    while (true) {
      const pos = step.indexOf(ref.mention, idx)
      if (pos === -1) break
      const beforeOk = pos === 0 || !/\w/.test(step[pos - 1])
      const afterOk = pos + ref.mention.length >= step.length || !/\w/.test(step[pos + ref.mention.length])
      if (beforeOk && afterOk) {
        spans.push({ start: pos, end: pos + ref.mention.length, seg: { type: 'mention', text: ref.mention, ingredientIndex: ref.ingredient_index } })
      }
      idx = pos + ref.mention.length
    }
  }

  if (durationMatch) {
    spans.push({ start: durationMatch.start, end: durationMatch.end, seg: { type: 'timer', seconds: durationMatch.seconds } })
  }

  spans.sort((a, b) => a.start - b.start)
  const filtered: typeof spans = []
  let cursor = 0
  for (const span of spans) {
    if (span.start >= cursor) {
      filtered.push(span)
      cursor = span.end
    }
  }
  const result: Segment[] = []
  let pos = 0
  for (const span of filtered) {
    if (pos < span.start) result.push({ type: 'text', text: step.slice(pos, span.start) })
    result.push(span.seg)
    pos = span.end
  }
  if (pos < step.length) result.push({ type: 'text', text: step.slice(pos) })
  return result
}

const StepText = ({
  step,
  stepRefs,
  durationMatch,
  timerProps,
  fontSize = 17,
  lineHeight = 22,
}: {
  step: string
  stepRefs: StepIngredientRef[]
  durationMatch?: DurationMatch | null
  timerProps?: Omit<React.ComponentProps<typeof TimerSpan>, 'seconds'>
  fontSize?: number
  lineHeight?: number
}) => {
  const segments = useMemo(
    () => buildSegments(step, stepRefs, durationMatch ?? null),
    [step, stepRefs, durationMatch],
  )

  return (
    <Text style={[styles.stepText, { fontSize, lineHeight }]}>
      {segments.map((seg, i) => {
        if (seg.type === 'text') return <Text key={i}>{seg.text}</Text>
        if (seg.type === 'mention') {
          return <Text key={i}>{seg.text}</Text>
        }
        if (seg.type === 'timer' && timerProps) {
          return <TimerSpan key={i} {...timerProps} seconds={seg.seconds} />
        }
        return null
      })}
    </Text>
  )
}

// ── Step row with optional timer ───────────────────────────────────────────────

const StepRow = ({
  step,
  index,
  recipe,
  componentIndex,
  stepRefs,
  rawIngredients,
  showStepQty = true,
  fontSize = 17,
  lineHeight = 22,
}: {
  step: string
  index: number
  recipe: RecipeOut
  componentIndex: number
  stepRefs: StepIngredientRef[]
  rawIngredients: string[]
  showStepQty?: boolean
  fontSize?: number
  lineHeight?: number
}) => {
  const { t } = useTranslation()
  const durationMatch = useMemo(() => parseDurationMatch(step), [step])
  const timerId = `${recipe.id}-c${componentIndex}-s${index}`

  const stepIngredients = useMemo(() => {
    const seen = new Set<number>()
    return stepRefs.filter((ref) => {
      if (seen.has(ref.ingredient_index)) return false
      seen.add(ref.ingredient_index)
      return true
    })
  }, [stepRefs])

  return (
    <View style={styles.stepRow}>
      <Text style={styles.stepNum}>{index + 1}.</Text>
      <View style={styles.stepBody}>
        <StepText
          step={step}
          stepRefs={stepRefs}
          durationMatch={durationMatch}
          timerProps={
            durationMatch
              ? { timerId, recipe, componentIndex, stepIndex: index, stepText: step }
              : undefined
          }
          fontSize={fontSize}
          lineHeight={lineHeight}
        />
        {showStepQty && stepIngredients.length > 0 && (
          <View style={styles.stepIngList}>
            {stepIngredients.map((ref) => (
              <View key={ref.ingredient_index} style={styles.stepIngRow}>
                <View style={styles.stepIngDot} />
                <Text style={styles.stepIngItem}>
                  {displayIngredient(rawIngredients[ref.ingredient_index] ?? '', t)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  )
}

// ── Ingredient row ─────────────────────────────────────────────────────────────

const formatForList = (ing: Ingredient): string =>
  [ing.qty, ing.unit, ing.name].filter(Boolean).join(' ')

const IngredientRow = ({
  ingredient,
  addMode = false,
  isAdded = false,
  onAdd,
  fontSize = 17,
  lineHeight = 22,
}: {
  ingredient: Ingredient
  addMode?: boolean
  isAdded?: boolean
  onAdd?: () => void
  fontSize?: number
  lineHeight?: number
}) => {
  const { t } = useTranslation()
  const parts = [ingredient.qty, ingredient.unit, ingredient.name].filter(Boolean).join(' ')
  return (
    <View style={styles.ingredientRow}>
      <Text style={styles.bullet}>{'•'}</Text>
      <Text style={[styles.ingredientText, { fontSize, lineHeight }]}>
        {parts}
      </Text>
      {addMode && (
        <Pressable
          onPress={isAdded ? undefined : onAdd}
          hitSlop={8}
          style={styles.addIngredientBtn}
          accessibilityLabel={isAdded ? t('shoppingList.addedToList') : t('shoppingList.addToList')}
        >
          <Feather name={isAdded ? 'check' : 'plus'} size={18} color={isAdded ? colors.green : colors.blue} />
        </Pressable>
      )}
    </View>
  )
}

// ── Component section ──────────────────────────────────────────────────────────

const ComponentSection = ({
  component,
  index,
  recipe,
  addMode = false,
  showStepQty = true,
  sessionAdded,
  onAdd,
  onAddAll,
  fontSize = 17,
  lineHeight = 22,
}: {
  component: SaveComponent
  index: number
  recipe: RecipeOut
  addMode?: boolean
  showStepQty?: boolean
  sessionAdded?: Set<string>
  onAdd?: (key: string, text: string) => void
  onAddAll?: (keys: string[], texts: string[]) => void
  fontSize?: number
  lineHeight?: number
}) => {
  const { t } = useTranslation()
  const ingredients = useMemo(
    () =>
      component.ingredients.map((raw) => {
        if (typeof raw === 'string') {
          return { qty: null, unit: null, name: raw } as Ingredient
        }
        return raw as Ingredient
      }),
    [component.ingredients],
  )

  const stepRefs = useMemo<StepIngredientRef[][]>(
    () =>
      component.step_ingredient_refs != null
        ? component.step_ingredient_refs
        : buildClientStepRefs(
            component.steps,
            ingredients.map((ing) => serializeIngredient(ing)),
          ),
    [component.step_ingredient_refs, component.steps, ingredients],
  )

  const handleAddAll = useCallback(() => {
    const keys: string[] = []
    const texts: string[] = []
    ingredients.forEach((ing, i) => {
      const key = `${index}-${i}`
      if (!sessionAdded?.has(key)) {
        keys.push(key)
        texts.push(formatForList(ing))
      }
    })
    if (texts.length > 0) onAddAll?.(keys, texts)
  }, [ingredients, index, sessionAdded, onAddAll])

  const allAdded = useMemo(
    () => ingredients.length > 0 && ingredients.every((_, i) => sessionAdded?.has(`${index}-${i}`)),
    [ingredients, index, sessionAdded],
  )

  return (
    <View style={styles.componentBlock}>
      {component.name ? (
        <Text style={styles.componentName}>{capitalizeFirst(component.name)}</Text>
      ) : null}

      {ingredients.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>{t('recipes.sectionIngredients')}</Text>
            {addMode && (
              <Pressable
                onPress={allAdded ? undefined : handleAddAll}
                hitSlop={8}
                accessibilityLabel={t('shoppingList.addAll')}
              >
                <Text style={[styles.addAllText, allAdded && styles.addAllDone]}>
                  {allAdded ? t('shoppingList.addedToList') : t('shoppingList.addAll')}
                </Text>
              </Pressable>
            )}
          </View>
          {ingredients.map((ing, i) => (
            <IngredientRow
              key={i}
              ingredient={ing}
              addMode={addMode}
              isAdded={sessionAdded?.has(`${index}-${i}`) ?? false}
              onAdd={() => onAdd?.(`${index}-${i}`, formatForList(ing))}
              fontSize={fontSize}
              lineHeight={lineHeight}
            />
          ))}
        </View>
      )}

      {component.steps.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('recipes.steps')}</Text>
          {component.steps.map((step, i) => (
            <StepRow
              key={i}
              step={step}
              index={i}
              recipe={recipe}
              componentIndex={index}
              stepRefs={stepRefs[i] ?? []}
              rawIngredients={ingredients.map((ing) => serializeIngredient(ing))}
              showStepQty={showStepQty}
              fontSize={fontSize}
              lineHeight={lineHeight}
            />
          ))}
        </View>
      )}
    </View>
  )
}

// ── Main screen ────────────────────────────────────────────────────────────────

const KEEP_AWAKE_RECIPE_TAG = 'recipe-detail'
const KEEP_AWAKE_STORAGE_KEY = 'recipe-keep-screen-default'
const SHOW_STEP_QTY_STORAGE_KEY = 'recipe-show-step-qty'
const FONT_SIZE_STORAGE_KEY = 'recipe-font-size-index'

const FONT_SIZES = [13, 16, 17, 20, 22] as const
const LINE_HEIGHTS = [18, 21, 22, 25, 28] as const

const RecipeDetailScreen = () => {
  const { id: recipeId, edit: autoEditParam } = useLocalSearchParams<{ id: string; edit?: string }>()
  const navigation = useNavigation()
  const { t } = useTranslation()
  const api = useApiClient()
  const qc = useQueryClient()
  const { recipes, isLoading, error } = useRecipes()
  const { addItems } = useShoppingList()
  const { tags: allTags, create: createTagMutation } = useTags()
  const [keepScreenOn, setKeepScreenOn] = useState(false)
  const [showStepQty, setShowStepQty] = useState(true)
  const [fontSizeIndex, setFontSizeIndex] = useState(2)
  const [heroImageErrored, setHeroImageErrored] = useState(false)
  const [addMode, setAddMode] = useState(false)
  const [sessionAdded, setSessionAdded] = useState<Set<string>>(new Set())
  const insets = useSafeAreaInsets()
  const { enabled: debugMode } = useDebugMode()
  const mealPlanSheetRef = useRef<AddToMealPlanSheetHandle>(null)
  const addIngredientSheetRef = useRef<AddIngredientToShoppingListSheetHandle>(null)
  const pendingIngredientKeyRef = useRef<string | null>(null)

  // Edit mode — same layout as the read view, with editable fields in place
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<EditDraft | null>(null)
  const [selectedTags, setSelectedTags] = useState<Tag[]>([])
  const [saving, setSaving] = useState(false)
  const [unitPickerTarget, setUnitPickerTarget] = useState<{ ci: number; ii: number } | null>(null)
  const [showTagPicker, setShowTagPicker] = useState(false)
  const [uploadingThumb, setUploadingThumb] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [thumbErrored, setThumbErrored] = useState(false)
  const savedDraftRef = useRef<EditDraft | null>(null)
  const savedTagsRef = useRef<Tag[]>([])

  useEffect(() => {
    AsyncStorage.getItem(KEEP_AWAKE_STORAGE_KEY).then((val) => {
      const enabled = val === '1'
      setKeepScreenOn(enabled)
      if (enabled) void KeepAwake.activateKeepAwakeAsync(KEEP_AWAKE_RECIPE_TAG)
    })
    AsyncStorage.getItem(SHOW_STEP_QTY_STORAGE_KEY).then((val) => {
      if (val !== null) setShowStepQty(val === '1')
    })
    AsyncStorage.getItem(FONT_SIZE_STORAGE_KEY).then((val) => {
      if (val !== null) setFontSizeIndex(Number(val))
    })
    return () => { KeepAwake.deactivateKeepAwake(KEEP_AWAKE_RECIPE_TAG) }
  }, [])

  const handleToggleKeepScreenOn = useCallback((val: boolean) => {
    setKeepScreenOn(val)
    void AsyncStorage.setItem(KEEP_AWAKE_STORAGE_KEY, val ? '1' : '0')
    if (val) void KeepAwake.activateKeepAwakeAsync(KEEP_AWAKE_RECIPE_TAG)
    else KeepAwake.deactivateKeepAwake(KEEP_AWAKE_RECIPE_TAG)
  }, [])

  const handleFontSizeChange = useCallback((index: number) => {
    setFontSizeIndex(index)
    void AsyncStorage.setItem(FONT_SIZE_STORAGE_KEY, String(index))
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }, [])

  const recipe: RecipeOut | undefined = useMemo(
    () => recipes.find((r) => r.id === recipeId),
    [recipes, recipeId],
  )

  const handleEdit = useCallback(() => {
    if (!recipe) return
    const initial = buildDraft(recipe)
    setDraft(initial)
    savedDraftRef.current = initial
    setSelectedTags(recipe.tags)
    savedTagsRef.current = recipe.tags
    setThumbErrored(false)
    setEditing(true)
  }, [recipe])

  const autoEditAppliedRef = useRef(false)
  useEffect(() => {
    if (autoEditParam === '1' && recipe && !autoEditAppliedRef.current) {
      autoEditAppliedRef.current = true
      handleEdit()
    }
  }, [autoEditParam, recipe, handleEdit])

  const isEditDirty = useCallback(() => {
    const isStateDirty = JSON.stringify(draft) !== JSON.stringify(savedDraftRef.current)
    const isTagsDirty =
      selectedTags.map((tag) => tag.id).sort().join(',') !==
      savedTagsRef.current.map((tag) => tag.id).sort().join(',')
    return isStateDirty || isTagsDirty
  }, [draft, selectedTags])

  const handleCancelEdit = useCallback(() => {
    if (!isEditDirty()) {
      setEditing(false)
      return
    }
    Alert.alert(t('addRecipe.discardChangesTitle'), t('addRecipe.discardChangesMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('addRecipe.discard'), style: 'destructive', onPress: () => setEditing(false) },
    ])
  }, [isEditDirty, t])

  const updateComp = useCallback((ci: number, patch: Partial<EditComponent>) => {
    setDraft((prev) => prev && { ...prev, components: prev.components.map((c, i) => (i === ci ? { ...c, ...patch } : c)) })
  }, [])

  const setIngredient = useCallback((ci: number, ii: number, val: StructuredIngredient) => {
    setDraft((prev) => prev && {
      ...prev,
      components: prev.components.map((c, i) =>
        i === ci ? { ...c, ingredients: c.ingredients.map((ing, j) => (j === ii ? val : ing)) } : c,
      ),
    })
  }, [])

  const addIngredient = useCallback((ci: number) => {
    setDraft((prev) => prev && {
      ...prev,
      components: prev.components.map((c, i) =>
        i === ci ? { ...c, ingredients: [...c.ingredients, { qty: '', unit: '', name: '' }] } : c,
      ),
    })
  }, [])

  const removeIngredient = useCallback((ci: number, ii: number) => {
    setDraft((prev) => {
      if (!prev) return prev
      if (prev.components[ci].ingredients.length <= 1) return prev
      return {
        ...prev,
        components: prev.components.map((c, i) =>
          i === ci ? { ...c, ingredients: c.ingredients.filter((_, j) => j !== ii) } : c,
        ),
      }
    })
  }, [])

  const setStep = useCallback((ci: number, si: number, val: string) => {
    setDraft((prev) => prev && {
      ...prev,
      components: prev.components.map((c, i) =>
        i === ci ? { ...c, steps: c.steps.map((s, j) => (j === si ? val : s)) } : c,
      ),
    })
  }, [])

  const addStep = useCallback((ci: number) => {
    setDraft((prev) => prev && {
      ...prev,
      components: prev.components.map((c, i) => (i === ci ? { ...c, steps: [...c.steps, ''] } : c)),
    })
  }, [])

  const removeStep = useCallback((ci: number, si: number) => {
    setDraft((prev) => {
      if (!prev) return prev
      if (prev.components[ci].steps.length <= 1) return prev
      return {
        ...prev,
        components: prev.components.map((c, i) => (i === ci ? { ...c, steps: c.steps.filter((_, j) => j !== si) } : c)),
      }
    })
  }, [])

  const currentUnit = unitPickerTarget != null
    ? (draft?.components[unitPickerTarget.ci]?.ingredients[unitPickerTarget.ii]?.unit ?? '')
    : ''

  const handleTagAdd = useCallback((tag: Tag) => setSelectedTags((prev) => [...prev, tag]), [])
  const handleTagRemove = useCallback((id: string) => setSelectedTags((prev) => prev.filter((tag) => tag.id !== id)), [])
  const selectedTagIds = useMemo(() => new Set(selectedTags.map((tag) => tag.id)), [selectedTags])
  const handleTagCreate = useCallback(
    async (name: string): Promise<Tag> => createTagMutation.mutateAsync(name),
    [createTagMutation],
  )

  const handlePickThumbnail = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
      allowsEditing: false,
    })
    if (result.canceled || !result.assets[0]) return

    const asset = result.assets[0]
    setUploadingThumb(true)
    setUploadProgress(0)
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    try {
      const data = await uploadThumbnailImage(recipeId, asset, setUploadProgress)
      setDraft((prev) => prev && { ...prev, thumbnail_url: data.url })
      setThumbErrored(false)
    } catch {
      Alert.alert(t('common.ok'), t('common.uploadFailed'))
    } finally {
      setUploadingThumb(false)
      setUploadProgress(0)
    }
  }, [recipeId, t])

  const handleSaveEdit = useCallback(async () => {
    if (!draft || !recipe) return
    setSaving(true)
    try {
      const updated = await api.updateRecipe(recipeId, {
        title: draft.title,
        servings: draft.servings !== '' ? Number(draft.servings) : null,
        kcal_per_serving: draft.kcal !== '' ? Number(draft.kcal) : null,
        protein_per_serving: draft.protein !== '' ? Number(draft.protein) : null,
        fat_per_serving: draft.fat !== '' ? Number(draft.fat) : null,
        carbs_per_serving: draft.carbs !== '' ? Number(draft.carbs) : null,
        thumbnail_url: draft.thumbnail_url || null,
        source_url: recipe.source_url ?? null,
        notes: draft.notes || null,
        creator_handle: recipe.creator_handle ?? null,
        components: draft.components.map((c) => ({
          name: c.name ?? '',
          yield_note: c.yield_note ?? '',
          ingredients: c.ingredients.filter((ing) => ing.name).map(serializeIngredient),
          steps: c.steps.filter(Boolean),
          ingredient_flags: [],
          step_ingredient_refs: null,
        })),
        tag_ids: selectedTags.map((tag) => tag.id),
      })
      qc.setQueryData<RecipeOut[]>(['recipes'], (prev) =>
        prev ? prev.map((r) => (r.id === updated.id ? updated : r)) : prev,
      )
      setEditing(false)
    } catch {
      Alert.alert(t('common.ok'), t('addRecipe.saveError'))
    } finally {
      setSaving(false)
    }
  }, [draft, recipe, api, recipeId, selectedTags, qc, t])

  const handleOpenMealPlanSheet = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    mealPlanSheetRef.current?.present()
  }, [])

  const handleAddIngredient = useCallback((key: string, text: string) => {
    pendingIngredientKeyRef.current = key
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    addIngredientSheetRef.current?.present(text)
  }, [])

  const handleConfirmAddIngredient = useCallback(
    (text: string) => {
      addItems.mutate([text])
      const key = pendingIngredientKeyRef.current
      if (key) setSessionAdded((prev) => new Set([...prev, key]))
      pendingIngredientKeyRef.current = null
    },
    [addItems],
  )

  const handleAddAll = useCallback(
    (keys: string[], texts: string[]) => {
      addItems.mutate(texts)
      setSessionAdded((prev) => new Set([...prev, ...keys]))
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    },
    [addItems],
  )

  useLayoutEffect(() => {
    if (editing) {
      navigation.setOptions({
        gestureEnabled: false,
        headerTransparent: true,
        headerTitle: '',
        headerShadowVisible: false,
        headerLeft: () => (
          <Pressable
            onPress={handleCancelEdit}
            hitSlop={8}
            style={({ pressed }) => [styles.headerBackBtn, pressed && { opacity: 0.5 }]}
            accessibilityLabel={t('common.back')}
          >
            <Ionicons name="chevron-back" size={28} color={PlatformColor('label') as unknown as string} />
            <Text style={styles.headerBackText}>{t('common.back')}</Text>
          </Pressable>
        ),
        headerRight: () => (
          <View style={styles.headerBtns}>
            <BugReportButton />
            <BellMenu />
          </View>
        ),
      })
    } else {
      navigation.setOptions({
        gestureEnabled: true,
        headerTransparent: true,
        headerTitle: '',
        headerShadowVisible: false,
        headerLeft: undefined,
        headerRight: () => (
          <View style={styles.headerBtns}>
            <Pressable
              onPress={() => setAddMode((prev) => !prev)}
              style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}
              accessibilityLabel={t('shoppingList.addToList')}
              accessibilityRole="button"
            >
              <Feather name="shopping-cart" size={20} color={addMode ? colors.blue : colors.secondaryLabel} />
            </Pressable>
            <Pressable
              onPress={handleOpenMealPlanSheet}
              style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}
              accessibilityLabel={t('mealPlan.addToMealPlan')}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Feather name="calendar" size={20} color={colors.secondaryLabel} />
            </Pressable>
            <Pressable
              onPress={handleEdit}
              style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}
              accessibilityLabel={t('common.edit')}
              accessibilityRole="button"
            >
              <Feather name="edit-2" size={22} color={colors.secondaryLabel} />
            </Pressable>
            <BugReportButton />
            <BellMenu />
          </View>
        ),
      })
    }
  }, [navigation, editing, handleEdit, handleCancelEdit, handleOpenMealPlanSheet, addMode, recipe, t])

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" accessibilityLabel={t('common.loading')} />
      </View>
    )
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error.message}</Text>
      </View>
    )
  }

  if (!recipe) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{t('recipes.noResults')}</Text>
      </View>
    )
  }

  const hasImage = !!recipe.thumbnail_url

  if (editing && draft) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={insets.top + 56}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
          contentInsetAdjustmentBehavior="never"
          keyboardShouldPersistTaps="handled"
        >
          {draft.thumbnail_url && !thumbErrored ? (
            <View>
              <Image
                source={{ uri: proxyThumbnailUrl(draft.thumbnail_url)! }}
                style={styles.heroImage}
                accessibilityLabel={draft.title}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={draft.thumbnail_url}
                onError={() => setThumbErrored(true)}
              />
              <Pressable
                style={({ pressed }) => [styles.heroEditBtn, pressed && { opacity: 0.7 }]}
                onPress={handlePickThumbnail}
                disabled={uploadingThumb}
                accessibilityLabel={t('common.changePhoto')}
              >
                {uploadingThumb ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Feather name="camera" size={14} color="#ffffff" />
                )}
                <Text style={styles.heroEditText}>
                  {uploadingThumb ? t('common.uploading') : t('common.changePhoto')}
                </Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={({ pressed }) => [styles.heroImage, styles.heroPlaceholder, pressed && { opacity: 0.7 }]}
              onPress={handlePickThumbnail}
              disabled={uploadingThumb}
              accessibilityLabel={t('common.addPhoto')}
            >
              {uploadingThumb ? (
                <ActivityIndicator size="small" />
              ) : (
                <>
                  <Feather name="camera" size={28} color={colors.secondaryLabel} />
                  <Text style={styles.heroPlaceholderText}>{t('common.addPhoto')}</Text>
                </>
              )}
            </Pressable>
          )}

          <View style={styles.card}>
            <TextInput
              style={[styles.title, styles.titleInput]}
              value={draft.title}
              onChangeText={(v) => setDraft((prev) => prev && { ...prev, title: v })}
              multiline
              accessibilityLabel={t('recipes.colTitle')}
            />

            <View style={styles.tagRow}>
              {selectedTags.map((tag) => (
                <Pressable
                  key={tag.id}
                  style={({ pressed }) => [styles.tag, pressed && { opacity: 0.7 }]}
                  onPress={() => handleTagRemove(tag.id)}
                  accessibilityLabel={`${tag.name}, tap to remove`}
                >
                  <Text style={styles.tagText}>{tTag(tag.name, t)} ×</Text>
                </Pressable>
              ))}
              <Pressable
                style={({ pressed }) => [styles.addTagBtn, pressed && { opacity: 0.7 }]}
                onPress={() => setShowTagPicker(true)}
                accessibilityLabel={t('tags.addTag')}
              >
                <Text style={styles.addTagBtnText}>+ {t('tags.addTag')}</Text>
              </Pressable>
            </View>

            <NutritionBoxGrid
              editing
              items={[
                { label: t('recipes.serves'), value: draft.servings, accessibilityLabel: t('recipes.serves') },
                { label: t('recipes.kcalPerServing'), value: draft.kcal, accessibilityLabel: t('recipes.kcalPerServing') },
                { label: t('recipes.proteinPerServing'), value: draft.protein, accessibilityLabel: t('recipes.proteinPerServing') },
                { label: t('recipes.fatPerServing'), value: draft.fat, accessibilityLabel: t('recipes.fatPerServing') },
                { label: t('recipes.carbsPerServing'), value: draft.carbs, accessibilityLabel: t('recipes.carbsPerServing') },
              ]}
              onChangeValue={(index, value) => {
                const key = (['servings', 'kcal', 'protein', 'fat', 'carbs'] as const)[index]
                setDraft((prev) => prev && { ...prev, [key]: value })
              }}
              disclaimerText={t('recipes.nutritionEstimateDisclaimer')}
            />

            <TagPickerModal
              visible={showTagPicker}
              allTags={allTags}
              selectedIds={selectedTagIds}
              onAdd={handleTagAdd}
              onRemove={handleTagRemove}
              onCreate={handleTagCreate}
              onClose={() => setShowTagPicker(false)}
            />
            <UnitPickerModal
              visible={unitPickerTarget != null}
              selected={currentUnit}
              onSelect={(unit) => {
                if (unitPickerTarget == null) return
                setIngredient(unitPickerTarget.ci, unitPickerTarget.ii, {
                  ...draft.components[unitPickerTarget.ci].ingredients[unitPickerTarget.ii],
                  unit,
                })
              }}
              onClose={() => setUnitPickerTarget(null)}
            />

            <View style={styles.notesBlock}>
              <Text style={styles.sectionLabel}>{t('recipes.notes')}</Text>
              <TextInput
                style={[styles.notesText, styles.notesInput]}
                value={draft.notes}
                onChangeText={(v) => setDraft((prev) => prev && { ...prev, notes: v })}
                multiline
                placeholder={t('common.addPrivateNotes')}
                accessibilityLabel={t('recipes.notes')}
              />
            </View>

            {draft.components.map((comp, ci) => (
              <View key={ci} style={styles.componentBlock}>
                {draft.components.length > 1 && (
                  <TextInput
                    style={[styles.componentName, styles.componentNameInput]}
                    value={comp.name}
                    onChangeText={(v) => updateComp(ci, { name: v })}
                    accessibilityLabel={t('settings.nameLabel')}
                  />
                )}

                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>{t('recipes.sectionIngredients')}</Text>
                  {comp.ingredients.map((ing, ii) => (
                    <IngredientEditor
                      key={ii}
                      value={ing}
                      flag={null}
                      activeAllergens={[]}
                      onChange={(v) => setIngredient(ci, ii, v)}
                      onUnitPress={() => setUnitPickerTarget({ ci, ii })}
                      onReplace={() => {}}
                      onRestore={() => {}}
                      onRemove={comp.ingredients.length > 1 ? () => removeIngredient(ci, ii) : undefined}
                    />
                  ))}
                  <Pressable
                    style={({ pressed }) => [styles.addRowBtn, pressed && { opacity: 0.7 }]}
                    onPress={() => addIngredient(ci)}
                    accessibilityLabel={t('addRecipe.addIngredient')}
                  >
                    <Text style={styles.addRowBtnText}>+ {t('addRecipe.addIngredient')}</Text>
                  </Pressable>
                </View>

                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>{t('recipes.steps')}</Text>
                  {comp.steps.map((step, si) => (
                    <View key={si} style={styles.stepEditRow}>
                      <Text style={styles.stepNum}>{si + 1}.</Text>
                      <TextInput
                        style={styles.stepInput}
                        value={step}
                        onChangeText={(v) => setStep(ci, si, v)}
                        multiline
                        accessibilityLabel={`${t('common.step')} ${si + 1}`}
                      />
                      {comp.steps.length > 1 && (
                        <Pressable
                          style={({ pressed }) => [styles.stepRemoveBtn, pressed && { opacity: 0.6 }]}
                          onPress={() => removeStep(ci, si)}
                          hitSlop={8}
                          accessibilityLabel={t('addRecipe.removeStep')}
                        >
                          <Text style={styles.stepRemoveText}>−</Text>
                        </Pressable>
                      )}
                    </View>
                  ))}
                  <Pressable
                    style={({ pressed }) => [styles.addRowBtn, pressed && { opacity: 0.7 }]}
                    onPress={() => addStep(ci)}
                    accessibilityLabel={t('addRecipe.addStep')}
                  >
                    <Text style={styles.addRowBtnText}>+ {t('addRecipe.addStep')}</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>

        <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Pressable
            style={({ pressed }) => [styles.secondaryBtn, styles.flex, pressed && { opacity: 0.7 }]}
            onPress={handleCancelEdit}
            disabled={saving}
            accessibilityLabel={t('common.cancel')}
          >
            <Text style={styles.secondaryBtnText}>{t('common.cancel')}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.primaryBtn, styles.flex, saving && styles.btnDisabled, pressed && { opacity: 0.7 }]}
            onPress={handleSaveEdit}
            disabled={saving}
            accessibilityLabel={t('common.save')}
          >
            {saving ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.primaryBtnText}>{t('common.save')}</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    )
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
        contentInsetAdjustmentBehavior="never"
      >
        {hasImage && !heroImageErrored ? (
          <Image
            source={{ uri: proxyThumbnailUrl(recipe.thumbnail_url!)! }}
            style={styles.heroImage}
            accessibilityLabel={recipe.title}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={recipe.thumbnail_url}
            onError={() => setHeroImageErrored(true)}
          />
        ) : hasImage && heroImageErrored && PLACEHOLDER_URL ? (
          <Image
            source={{ uri: PLACEHOLDER_URL }}
            style={styles.heroImage}
            accessibilityLabel={recipe.title}
            contentFit="cover"
          />
        ) : (
          <View style={{ height: insets.top + 56 }} />
        )}

        <View style={styles.card}>
          <Text style={styles.title}>{recipe.title}</Text>

          {recipe.tags.length > 0 && (
            <View style={styles.tagRow}>
              {recipe.tags.map((tag) => (
                <View key={tag.id} style={styles.tag}>
                  <Text style={styles.tagText}>{tTag(tag.name, t)}</Text>
                </View>
              ))}
            </View>
          )}

          <NutritionBoxGrid
            editing={false}
            items={[
              { label: t('recipes.serves'), value: recipe.servings?.toString() ?? '', accessibilityLabel: t('recipes.serves') },
              { label: t('recipes.colKcal'), value: recipe.kcal_per_serving?.toString() ?? '', accessibilityLabel: t('recipes.kcalPerServing') },
              { label: t('recipes.protein'), value: recipe.protein_per_serving?.toString() ?? '', accessibilityLabel: t('recipes.proteinPerServing') },
              { label: t('recipes.fat'), value: recipe.fat_per_serving?.toString() ?? '', accessibilityLabel: t('recipes.fatPerServing') },
              { label: t('recipes.carbs'), value: recipe.carbs_per_serving?.toString() ?? '', accessibilityLabel: t('recipes.carbsPerServing') },
            ]}
            disclaimerText={t('recipes.nutritionEstimateDisclaimer')}
          />

          {recipe.source_url ? (
            <Pressable
              onPress={() => void Linking.openURL(recipe.source_url!)}
              style={({ pressed }) => [styles.sourceRow, pressed && { opacity: 0.7 }]}
              accessibilityLabel={t('recipes.source')}
              accessibilityRole="link"
            >
              <Feather name="link" size={13} color={colors.blue} style={styles.sourceIcon} />
              <Text style={styles.sourceText} numberOfLines={1}>
                {extractDisplayUrl(recipe.source_url)}
              </Text>
            </Pressable>
          ) : null}

          {debugMode && recipe.debug_model ? (
            <View style={styles.debugBox}>
              <Text style={styles.debugTitle}>{t('recipes.debugInfo')}</Text>
              <Text style={styles.debugText}>
                {t('recipes.debugModel')}: {recipe.debug_model}
              </Text>
              <Text style={styles.debugText}>
                {t('recipes.debugTokens')}: {recipe.debug_total_tokens ?? '—'}
                {' '}({t('recipes.debugInputTokens')} {recipe.debug_input_tokens ?? '—'}
                {' · '}{t('recipes.debugOutputTokens')} {recipe.debug_output_tokens ?? '—'})
              </Text>
            </View>
          ) : null}

          <View style={styles.toggleGroup}>
            <View style={styles.keepScreenRow}>
              <Text style={styles.keepScreenLabel}>{t('settings.keepScreenOnDefault')}</Text>
              <Switch
                value={keepScreenOn}
                onValueChange={handleToggleKeepScreenOn}
                accessibilityLabel={t('settings.keepScreenOnDefault')}
              />
            </View>
            <View style={styles.toggleDivider} />
            <View style={styles.keepScreenRow}>
              <Text style={styles.keepScreenLabel}>{t('settings.showQuantityUnderStep')}</Text>
              <Switch
                value={showStepQty}
                onValueChange={(val) => {
                  setShowStepQty(val)
                  void AsyncStorage.setItem(SHOW_STEP_QTY_STORAGE_KEY, val ? '1' : '0')
                }}
                accessibilityLabel={t('settings.showQuantityUnderStep')}
              />
            </View>
            <View style={styles.toggleDivider} />
            <View style={styles.keepScreenRow}>
              <Text style={styles.keepScreenLabel}>{t('settings.textSize')}</Text>
              <View style={styles.fontSizeControl}>
                <Ionicons name="text" size={13} color={colors.secondaryLabel} />
                <View style={styles.fontSizeTrack}>
                  <View style={styles.fontSizeTrackLine} />
                  {FONT_SIZES.map((_, i) => (
                    <Pressable
                      key={i}
                      onPress={() => handleFontSizeChange(i)}
                      hitSlop={10}
                      style={styles.fontSizeDotWrapper}
                      accessibilityRole="radio"
                      accessibilityLabel={`${t('settings.textSize')} ${i + 1}`}
                    >
                      <View style={[styles.fontSizeDot, fontSizeIndex === i && styles.fontSizeDotActive]} />
                    </Pressable>
                  ))}
                </View>
                <Ionicons name="text" size={20} color={colors.secondaryLabel} />
              </View>
            </View>
          </View>

          {recipe.notes ? (
            <View style={styles.notesBlock}>
              <Text style={styles.sectionLabel}>{t('recipes.notes')}</Text>
              <Text style={[styles.notesText, { fontSize: FONT_SIZES[fontSizeIndex], lineHeight: LINE_HEIGHTS[fontSizeIndex] }]}>{recipe.notes}</Text>
            </View>
          ) : null}

          {recipe.components.map((component, i) => (
            <ComponentSection
              key={i}
              component={component}
              index={i}
              recipe={recipe}
              addMode={addMode}
              showStepQty={showStepQty}
              sessionAdded={sessionAdded}
              onAdd={handleAddIngredient}
              onAddAll={handleAddAll}
              fontSize={FONT_SIZES[fontSizeIndex]}
              lineHeight={LINE_HEIGHTS[fontSizeIndex]}
            />
          ))}
        </View>
      </ScrollView>
      <AddToMealPlanSheet ref={mealPlanSheetRef} recipeId={recipe.id} />
      <AddIngredientToShoppingListSheet ref={addIngredientSheetRef} onConfirm={handleConfirmAddIngredient} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  heroImage: {
    width: '100%',
    height: HERO_HEIGHT,
  },
  scroll: { flex: 1 },
  card: {
    backgroundColor: colors.background,
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: { color: colors.red, fontSize: 16, textAlign: 'center' },
  headerBtns: { flexDirection: 'row', alignItems: 'center' },
  headerBtn: { paddingHorizontal: 4, paddingVertical: 4, marginRight: 4 },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.label,
    marginBottom: 10,
    lineHeight: 34,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
    gap: 6,
  },
  tag: {
    backgroundColor: colors.brandLight,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: { color: colors.brand, fontSize: 12, fontWeight: '500' },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sourceIcon: { marginRight: 5 },
  sourceText: { fontSize: 13, color: colors.blue },
  debugBox: {
    backgroundColor: colors.gray6,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    gap: 2,
  },
  debugTitle: { fontSize: 11, fontWeight: '600', color: colors.secondaryLabel, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 2 },
  debugText: { fontSize: 12, color: colors.secondaryLabel },
  toggleGroup: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
    marginBottom: 16,
  },
  toggleDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.separator,
  },
  keepScreenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  keepScreenLabel: { fontSize: 16, color: colors.label },
  fontSizeControl: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fontSizeTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 120,
    position: 'relative',
  },
  fontSizeTrackLine: {
    position: 'absolute',
    left: 10,
    right: 10,
    height: 1.5,
    backgroundColor: colors.separator,
  },
  fontSizeDotWrapper: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  fontSizeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.separator,
    backgroundColor: colors.background,
  },
  fontSizeDotActive: {
    borderColor: colors.blue,
    backgroundColor: colors.blue,
  },
  notesBlock: { marginBottom: 16 },
  notesText: { fontSize: 17, color: colors.secondaryLabel, lineHeight: 22 },
  componentBlock: { marginTop: 8 },
  componentName: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.label,
    marginBottom: 12,
    lineHeight: 25,
  },
  section: { marginBottom: 16 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.secondaryLabel,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addAllText: { fontSize: 13, color: colors.blue },
  addAllDone: { color: colors.green },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  bullet: { color: colors.tertiaryLabel, marginRight: 8, marginTop: 1 },
  ingredientText: { flex: 1, fontSize: 17, color: colors.label, lineHeight: 22 },
  addIngredientBtn: { marginLeft: 8, marginTop: 2 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  stepNum: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.blue,
    width: 28,
    marginTop: 1,
  },
  stepBody: { flex: 1 },
  timerSpan: { color: '#d97706', fontWeight: '700' },
  stepText: { fontSize: 17, color: colors.label, lineHeight: 22 },
  stepIngList: {
    marginTop: 8,
    gap: 5,
  },
  stepIngRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  stepIngDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.tertiaryLabel,
    marginTop: 8,
  },
  stepIngItem: {
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
    color: colors.secondaryLabel,
  },

  // Edit mode
  flex: { flex: 1 },
  headerBackBtn: { flexDirection: 'row', alignItems: 'center', marginLeft: -8 },
  headerBackText: { fontSize: 17, color: colors.label },
  heroEditBtn: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  heroEditText: { fontSize: 12, color: '#ffffff', fontWeight: '600' },
  heroPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.gray6,
  },
  heroPlaceholderText: { fontSize: 13, color: colors.secondaryLabel },
  titleInput: {
    borderBottomWidth: 1,
    borderColor: colors.opaqueSeparator,
    paddingBottom: 4,
  },
  addTagBtn: {
    borderWidth: 1,
    borderColor: colors.opaqueSeparator,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  addTagBtnText: { fontSize: 12, color: colors.secondaryLabel },
  notesInput: {
    borderWidth: 1,
    borderColor: colors.opaqueSeparator,
    borderRadius: 8,
    padding: 8,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  componentNameInput: {
    borderBottomWidth: 1,
    borderColor: colors.opaqueSeparator,
    paddingBottom: 4,
  },
  addRowBtn: { paddingVertical: 8 },
  addRowBtnText: { fontSize: 16, color: colors.blue, fontWeight: '500' },
  stepEditRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 8 },
  stepInput: {
    flex: 1,
    fontSize: 17,
    color: colors.label,
    lineHeight: 22,
    borderBottomWidth: 1,
    borderColor: colors.opaqueSeparator,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  stepRemoveBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 3,
  },
  stepRemoveText: { fontSize: 16, color: '#fff', fontWeight: '600', lineHeight: 20 },
  actionBar: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
    backgroundColor: colors.background,
  },
  secondaryBtn: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: colors.gray6,
  },
  secondaryBtnText: { fontSize: 16, color: colors.label, fontWeight: '500' },
  primaryBtn: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: colors.blue,
  },
  primaryBtnText: { fontSize: 16, color: '#ffffff', fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },
})

export default RecipeDetailScreen
