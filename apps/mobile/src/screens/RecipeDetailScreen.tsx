import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { Feather } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as KeepAwake from 'expo-keep-awake'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation, useLocalSearchParams, useRouter } from 'expo-router'
import { useRecipes } from '@platekeeper/shared/hooks/useRecipes'
import { useShoppingList } from '@platekeeper/shared/hooks/useShoppingList'
import {
  parseDurationMatch,
  formatDurationLabel,
  useTimers,
  getRemainingSeconds,
  formatCountdown,
  type DurationMatch,
} from '../context/TimerContext'
import BellMenu from '../components/BellMenu'
import type { RecipeOut, SaveComponent, Ingredient, StepIngredientRef } from '@platekeeper/shared/types'
import { displayIngredient, buildClientStepRefs } from '@platekeeper/shared/utils/ingredientUtils'
import { tTag } from '@platekeeper/shared/utils/tagUtils'
import { colors } from '../theme/colors'
import { proxyThumbnailUrl } from '../api/thumbnailUrl'

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')

const HERO_HEIGHT = 220
const CARD_OVERLAP = 24

const extractDisplayUrl = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url.length > 40 ? url.slice(0, 40) + '…' : url
  }
}

const capitalizeFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

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
        {`⏱ ${formatDurationLabel(seconds)}`}
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
      accessibilityLabel={isDone ? t('common.done') : isRunning ? t('common.pause') : t('common.resume')}
    >
      {isDone ? `✓ ${t('common.done')}` : `⏱ ${formatCountdown(remaining)}`}
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
  rawIngredients,
  durationMatch,
  timerProps,
}: {
  step: string
  stepRefs: StepIngredientRef[]
  rawIngredients: string[]
  durationMatch?: DurationMatch | null
  timerProps?: Omit<React.ComponentProps<typeof TimerSpan>, 'seconds'>
}) => {
  const { t } = useTranslation()
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null)

  const segments = useMemo(
    () => buildSegments(step, stepRefs, durationMatch ?? null),
    [step, stepRefs, durationMatch],
  )

  return (
    <>
      <Text style={styles.stepText}>
        {segments.map((seg, i) => {
          if (seg.type === 'text') return <Text key={i}>{seg.text}</Text>
          if (seg.type === 'mention') {
            return (
              <Text
                key={i}
                style={styles.ingredientMention}
                onPress={(e) => {
                  const ingText = displayIngredient(rawIngredients[seg.ingredientIndex] ?? '', t)
                  const { pageX, pageY } = e.nativeEvent
                  setTooltip({ text: ingText, x: pageX, y: pageY })
                }}
                accessibilityRole="button"
                accessibilityLabel={t('recipes.showIngredientAmount')}
              >
                {seg.text}
              </Text>
            )
          }
          if (seg.type === 'timer' && timerProps) {
            return <TimerSpan key={i} {...timerProps} seconds={seg.seconds} />
          }
          return null
        })}
      </Text>
      {tooltip && (
        <Modal transparent animationType="none" onRequestClose={() => setTooltip(null)}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setTooltip(null)}
            accessibilityLabel={t('recipes.dismissIngredientTooltip')}
          >
            <View
              style={[
                styles.ingredientTooltip,
                {
                  top: tooltip.y > 80 ? tooltip.y - 52 : tooltip.y + 16,
                  left: Math.max(8, Math.min(tooltip.x - 110, SCREEN_WIDTH - 228)),
                },
              ]}
            >
              <Text style={styles.ingredientTooltipText}>{tooltip.text}</Text>
            </View>
          </Pressable>
        </Modal>
      )}
    </>
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
}: {
  step: string
  index: number
  recipe: RecipeOut
  componentIndex: number
  stepRefs: StepIngredientRef[]
  rawIngredients: string[]
}) => {
  const durationMatch = useMemo(() => parseDurationMatch(step), [step])
  const timerId = `${recipe.id}-c${componentIndex}-s${index}`

  return (
    <View style={styles.stepRow}>
      <Text style={styles.stepNum}>{index + 1}.</Text>
      <View style={styles.stepBody}>
        <StepText
          step={step}
          stepRefs={stepRefs}
          rawIngredients={rawIngredients}
          durationMatch={durationMatch}
          timerProps={
            durationMatch
              ? { timerId, recipe, componentIndex, stepIndex: index, stepText: step }
              : undefined
          }
        />
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
}: {
  ingredient: Ingredient
  addMode?: boolean
  isAdded?: boolean
  onAdd?: () => void
}) => {
  const { t } = useTranslation()
  const parts = [ingredient.qty, ingredient.unit, ingredient.name].filter(Boolean).join(' ')
  const note = ingredient.note ? ` (${ingredient.note})` : ''
  return (
    <View style={styles.ingredientRow}>
      <Text style={styles.bullet}>{'•'}</Text>
      <Text style={styles.ingredientText}>
        {parts}
        {note}
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
  sessionAdded,
  onAdd,
  onAddAll,
}: {
  component: SaveComponent
  index: number
  recipe: RecipeOut
  addMode?: boolean
  sessionAdded?: Set<string>
  onAdd?: (key: string, text: string) => void
  onAddAll?: (keys: string[], texts: string[]) => void
}) => {
  const { t } = useTranslation()
  const ingredients = useMemo(
    () =>
      component.ingredients.map((raw) => {
        if (typeof raw === 'string') {
          return { qty: null, unit: null, name: raw, note: null } as Ingredient
        }
        return raw as Ingredient
      }),
    [component.ingredients],
  )

  const stepRefs = useMemo<StepIngredientRef[][]>(
    () =>
      component.step_ingredient_refs != null
        ? component.step_ingredient_refs
        : buildClientStepRefs(component.steps, component.ingredients),
    [component.step_ingredient_refs, component.steps, component.ingredients],
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
              rawIngredients={component.ingredients}
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

const RecipeDetailScreen = () => {
  const { id: recipeId } = useLocalSearchParams<{ id: string }>()
  const navigation = useNavigation()
  const router = useRouter()
  const { t } = useTranslation()
  const { recipes, isLoading, error } = useRecipes()
  const { addItems } = useShoppingList()
  const [keepScreenOn, setKeepScreenOn] = useState(false)
  const [addMode, setAddMode] = useState(false)
  const [sessionAdded, setSessionAdded] = useState<Set<string>>(new Set())
  const insets = useSafeAreaInsets()

  useEffect(() => {
    AsyncStorage.getItem(KEEP_AWAKE_STORAGE_KEY).then((val) => {
      const enabled = val === '1'
      setKeepScreenOn(enabled)
      if (enabled) void KeepAwake.activateKeepAwakeAsync(KEEP_AWAKE_RECIPE_TAG)
    })
    return () => { KeepAwake.deactivateKeepAwake(KEEP_AWAKE_RECIPE_TAG) }
  }, [])

  const handleToggleKeepScreenOn = useCallback((val: boolean) => {
    setKeepScreenOn(val)
    void AsyncStorage.setItem(KEEP_AWAKE_STORAGE_KEY, val ? '1' : '0')
    if (val) void KeepAwake.activateKeepAwakeAsync(KEEP_AWAKE_RECIPE_TAG)
    else KeepAwake.deactivateKeepAwake(KEEP_AWAKE_RECIPE_TAG)
  }, [])

  const recipe: RecipeOut | undefined = useMemo(
    () => recipes.find((r) => r.id === recipeId),
    [recipes, recipeId],
  )

  const handleEdit = useCallback(() => {
    router.push({ pathname: '/recipe/[id]/edit', params: { id: recipeId } })
  }, [router, recipeId])

  const handleAddIngredient = useCallback(
    (key: string, text: string) => {
      addItems.mutate([text])
      setSessionAdded((prev) => new Set([...prev, key]))
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
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
    navigation.setOptions({
      headerTransparent: true,
      headerTitle: '',
      headerShadowVisible: false,
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
            onPress={handleEdit}
            style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}
            accessibilityLabel={t('common.edit')}
            accessibilityRole="button"
          >
            <Feather name="edit-2" size={22} color={colors.secondaryLabel} />
          </Pressable>
          <BellMenu />
        </View>
      ),
    })
  }, [navigation, handleEdit, addMode, recipe, t])

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

  return (
    <View style={styles.container}>
      {hasImage && (
        <Image
          source={{ uri: proxyThumbnailUrl(recipe.thumbnail_url!)! }}
          style={styles.heroImage}
          accessibilityLabel={recipe.title}
          resizeMode="cover"
        />
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
        contentInsetAdjustmentBehavior="never"
      >
        {/* transparent spacer so card starts over the image */}
        <View style={hasImage ? styles.heroSpacer : { height: insets.top + 56 }} />

        <View style={[styles.card, !hasImage && styles.cardNoRound]}>
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

          <View style={styles.metaRow}>
            {recipe.servings != null && (
              <Text style={styles.metaItem}>
                {t('recipes.serves')}: {recipe.servings}
              </Text>
            )}
            {recipe.kcal_per_serving != null && (
              <Text style={styles.metaItem}>
                {recipe.kcal_per_serving} {t('recipes.kcalPerServing')}
              </Text>
            )}
          </View>

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

          <View style={styles.keepScreenRow}>
            <Text style={styles.keepScreenLabel}>{t('settings.keepScreenOnDefault')}</Text>
            <Switch
              value={keepScreenOn}
              onValueChange={handleToggleKeepScreenOn}
              accessibilityLabel={t('settings.keepScreenOnDefault')}
            />
          </View>

          {recipe.notes ? (
            <View style={styles.notesBlock}>
              <Text style={styles.sectionLabel}>{t('recipes.notes')}</Text>
              <Text style={styles.notesText}>{recipe.notes}</Text>
            </View>
          ) : null}

          {recipe.components.map((component, i) => (
            <ComponentSection
              key={i}
              component={component}
              index={i}
              recipe={recipe}
              addMode={addMode}
              sessionAdded={sessionAdded}
              onAdd={handleAddIngredient}
              onAddAll={handleAddAll}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  heroImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  scroll: { flex: 1, backgroundColor: 'transparent' },
  heroSpacer: { height: HERO_HEIGHT - CARD_OVERLAP },
  card: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 20,
    minHeight: SCREEN_HEIGHT - (HERO_HEIGHT - CARD_OVERLAP),
  },
  cardNoRound: { borderTopLeftRadius: 0, borderTopRightRadius: 0 },
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
  metaRow: { flexDirection: 'row', marginBottom: 10, gap: 16 },
  metaItem: { fontSize: 13, color: colors.secondaryLabel },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sourceIcon: { marginRight: 5 },
  sourceText: { fontSize: 13, color: colors.blue },
  keepScreenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
    marginBottom: 16,
  },
  keepScreenLabel: { fontSize: 16, color: colors.label },
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
  ingredientMention: {
    color: '#1d4ed8',
    backgroundColor: '#eff6ff',
    borderRadius: 4,
  },
  ingredientTooltip: {
    position: 'absolute',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: 220,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  ingredientTooltipText: { fontSize: 16, color: colors.label },
})

export default RecipeDetailScreen
