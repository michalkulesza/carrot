import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { Feather } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as KeepAwake from 'expo-keep-awake'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useRecipes } from '@platekeeper/shared/hooks/useRecipes'
import {
  parseDurationMatch,
  formatDurationLabel,
  useTimers,
  getRemainingSeconds,
  formatCountdown,
} from '../context/TimerContext'
import BellModal from '../components/BellModal'
import type { RecipesStackParamList } from '../navigation/RecipesStack'
import type { RecipeOut, SaveComponent, Ingredient, StepIngredientRef } from '@platekeeper/shared/types'
import { displayIngredient, buildClientStepRefs } from '@platekeeper/shared/utils/ingredientUtils'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

type Props = NativeStackScreenProps<RecipesStackParamList, 'RecipeDetail'>

// ── Timer button for a step ────────────────────────────────────────────────────

const TimerButton = ({
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
  const { timers, startTimer, pauseTimer, resumeTimer, cancelTimer } = useTimers()
  const timer = timers.get(timerId)

  if (!timer) {
    return (
      <TouchableOpacity
        style={styles.timerChip}
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
        accessibilityLabel={t('timers.startTimer')}
        accessibilityRole="button"
      >
        <Feather name="clock" size={12} color="#d97706" />
        <Text style={styles.timerChipText}>{formatDurationLabel(seconds)}</Text>
      </TouchableOpacity>
    )
  }

  const remaining = getRemainingSeconds(timer)
  const isRunning = timer.status === 'running'
  const isDone = timer.status === 'done' || remaining === 0

  return (
    <View style={[styles.timerChip, isDone && styles.timerChipDone]}>
      <Text
        style={[
          styles.timerChipText,
          { color: isDone ? '#10b981' : isRunning ? '#d97706' : '#9ca3af' },
        ]}
      >
        {isDone ? t('common.doneCheck') : formatCountdown(remaining)}
      </Text>
      {!isDone && (
        <>
          <TouchableOpacity
            onPress={() => (isRunning ? pauseTimer(timerId) : resumeTimer(timerId))}
            accessibilityLabel={isRunning ? t('common.pause') : t('common.resume')}
            accessibilityRole="button"
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Feather
              name={isRunning ? 'pause' : 'play'}
              size={12}
              color={isRunning ? '#d97706' : '#9ca3af'}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => cancelTimer(timerId)}
            accessibilityLabel={t('common.cancel')}
            accessibilityRole="button"
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Feather name="x" size={12} color="#9ca3af" />
          </TouchableOpacity>
        </>
      )}
    </View>
  )
}

// ── Step text with tappable ingredient pills ───────────────────────────────────

interface Segment {
  type: 'text' | 'mention'
  text: string
  ingredientIndex?: number
}

const buildSegments = (step: string, stepRefs: StepIngredientRef[]): Segment[] => {
  const spans: { start: number; end: number; mention: string; ingredientIndex: number }[] = []
  for (const ref of stepRefs) {
    let idx = 0
    while (true) {
      const pos = step.indexOf(ref.mention, idx)
      if (pos === -1) break
      spans.push({ start: pos, end: pos + ref.mention.length, mention: ref.mention, ingredientIndex: ref.ingredient_index })
      idx = pos + ref.mention.length
    }
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
    result.push({ type: 'mention', text: span.mention, ingredientIndex: span.ingredientIndex })
    pos = span.end
  }
  if (pos < step.length) result.push({ type: 'text', text: step.slice(pos) })
  return result
}

const StepText = ({
  step,
  stepRefs,
  rawIngredients,
}: {
  step: string
  stepRefs: StepIngredientRef[]
  rawIngredients: string[]
}) => {
  const { t } = useTranslation()
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null)

  const segments = useMemo(() => buildSegments(step, stepRefs), [step, stepRefs])
  const hasMentions = segments.some((s) => s.type === 'mention')

  if (!hasMentions) {
    return <Text style={styles.stepText}>{step}</Text>
  }

  return (
    <>
      <Text style={styles.stepText}>
        {segments.map((seg, i) => {
          if (seg.type === 'text') return <Text key={i}>{seg.text}</Text>
          return (
            <Text
              key={i}
              style={styles.ingredientMention}
              onPress={(e) => {
                const ingText = displayIngredient(rawIngredients[seg.ingredientIndex!] ?? '', t)
                const { pageX, pageY } = e.nativeEvent
                setTooltip({ text: ingText, x: pageX, y: pageY })
              }}
              accessibilityRole="button"
              accessibilityLabel={t('recipes.showIngredientAmount')}
            >
              {seg.text}
            </Text>
          )
        })}
      </Text>
      {tooltip && (
        <Modal transparent animationType="none" onRequestClose={() => setTooltip(null)}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={() => setTooltip(null)}
            activeOpacity={1}
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
          </TouchableOpacity>
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
        {durationMatch ? (
          <View style={styles.stepInline}>
            {durationMatch.start > 0 && (
              <StepText
                step={step.slice(0, durationMatch.start)}
                stepRefs={stepRefs}
                rawIngredients={rawIngredients}
              />
            )}
            <TimerButton
              timerId={timerId}
              recipe={recipe}
              componentIndex={componentIndex}
              stepIndex={index}
              stepText={step}
              seconds={durationMatch.seconds}
            />
            {durationMatch.end < step.length && (
              <StepText
                step={step.slice(durationMatch.end)}
                stepRefs={stepRefs}
                rawIngredients={rawIngredients}
              />
            )}
          </View>
        ) : (
          <StepText step={step} stepRefs={stepRefs} rawIngredients={rawIngredients} />
        )}
      </View>
    </View>
  )
}

// ── Ingredient row ─────────────────────────────────────────────────────────────

const IngredientRow = ({ ingredient }: { ingredient: Ingredient }) => {
  const parts = [ingredient.qty, ingredient.unit, ingredient.name]
    .filter(Boolean)
    .join(' ')
  const note = ingredient.note ? ` (${ingredient.note})` : ''
  return (
    <View style={styles.ingredientRow}>
      <Text style={styles.bullet}>{'•'}</Text>
      <Text style={styles.ingredientText}>
        {parts}
        {note}
      </Text>
    </View>
  )
}

// ── Component section ──────────────────────────────────────────────────────────

const ComponentSection = ({
  component,
  index,
  recipe,
}: {
  component: SaveComponent
  index: number
  recipe: RecipeOut
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

  return (
    <View style={styles.componentBlock}>
      {component.name ? (
        <Text style={styles.componentName}>{component.name}</Text>
      ) : null}

      {ingredients.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('recipes.sectionIngredients')}</Text>
          {ingredients.map((ing, i) => (
            <IngredientRow key={i} ingredient={ing} />
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

const RecipeDetailScreen = ({ route, navigation }: Props) => {
  const { recipeId } = route.params
  const { t } = useTranslation()
  const { recipes, isLoading, error } = useRecipes()
  const [keepScreenOn, setKeepScreenOn] = useState(false)

  useEffect(() => {
    AsyncStorage.getItem(KEEP_AWAKE_STORAGE_KEY).then((val) => {
      const enabled = val === '1'
      setKeepScreenOn(enabled)
      if (enabled) void KeepAwake.activateKeepAwakeAsync(KEEP_AWAKE_RECIPE_TAG)
    })
    return () => { KeepAwake.deactivateKeepAwake(KEEP_AWAKE_RECIPE_TAG) }
  }, [])

  const handleToggleKeepScreenOn = useCallback(() => {
    setKeepScreenOn((prev) => {
      const next = !prev
      void AsyncStorage.setItem(KEEP_AWAKE_STORAGE_KEY, next ? '1' : '0')
      if (next) void KeepAwake.activateKeepAwakeAsync(KEEP_AWAKE_RECIPE_TAG)
      else KeepAwake.deactivateKeepAwake(KEEP_AWAKE_RECIPE_TAG)
      return next
    })
  }, [])

  const recipe: RecipeOut | undefined = useMemo(
    () => recipes.find((r) => r.id === recipeId),
    [recipes, recipeId],
  )

  const handleEdit = useCallback(() => {
    navigation.navigate('EditRecipe', { recipeId })
  }, [navigation, recipeId])

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerBtns}>
          <TouchableOpacity
            onPress={handleToggleKeepScreenOn}
            style={styles.headerBtn}
            accessibilityLabel={keepScreenOn ? t('recipes.screenAlwaysOnDisable') : t('recipes.keepScreenOnWhileReading')}
            accessibilityRole="button"
          >
            <Text style={[styles.keepScreenBtn, keepScreenOn && styles.keepScreenBtnActive]}>
              ☀
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleEdit}
            style={styles.headerBtn}
            accessibilityLabel={t('common.edit')}
            accessibilityRole="button"
          >
            <Feather name="edit-2" size={18} color="#7c3aed" />
          </TouchableOpacity>
          <BellModal />
        </View>
      ),
    })
  }, [navigation, handleEdit, handleToggleKeepScreenOn, keepScreenOn, t])

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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {recipe.thumbnail_url ? (
        <Image
          source={{ uri: recipe.thumbnail_url }}
          style={styles.thumbnail}
          accessibilityLabel={recipe.title}
          resizeMode="cover"
        />
      ) : null}

      <Text style={styles.title}>{recipe.title}</Text>

      {recipe.tags.length > 0 && (
        <View style={styles.tagRow}>
          {recipe.tags.map((tag) => (
            <View key={tag.id} style={styles.tag}>
              <Text style={styles.tagText}>{tag.name}</Text>
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
        <Text style={styles.source} numberOfLines={1}>
          {t('recipes.source')}: {recipe.source_url}
        </Text>
      ) : null}

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
        />
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { paddingBottom: 40 },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: { color: '#dc2626', fontSize: 15, textAlign: 'center' },
  headerBtns: { flexDirection: 'row', alignItems: 'center' },
  headerBtn: { paddingHorizontal: 4, paddingVertical: 2, marginRight: 2 },
  keepScreenBtn: { fontSize: 18, color: '#d1d5db' },
  keepScreenBtnActive: { color: '#f59e0b' },
  thumbnail: { width: '100%', height: 220 },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: 16,
    marginBottom: 10,
    gap: 6,
  },
  tag: {
    backgroundColor: '#ede9fe',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: { color: '#7c3aed', fontSize: 12, fontWeight: '500' },
  metaRow: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 8, gap: 16 },
  metaItem: { fontSize: 13, color: '#6b7280' },
  source: { fontSize: 12, color: '#9ca3af', marginHorizontal: 16, marginBottom: 12 },
  notesBlock: { marginHorizontal: 16, marginBottom: 12 },
  notesText: { fontSize: 14, color: '#374151', lineHeight: 20 },
  componentBlock: { marginHorizontal: 16, marginTop: 12 },
  componentName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111',
    marginBottom: 8,
  },
  section: { marginBottom: 12 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  bullet: { color: '#9ca3af', marginRight: 8, marginTop: 1 },
  ingredientText: { flex: 1, fontSize: 15, color: '#111', lineHeight: 22 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  stepNum: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2563eb',
    width: 28,
    marginTop: 1,
  },
  stepBody: { flex: 1 },
  stepInline: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  stepText: { fontSize: 15, color: '#111', lineHeight: 22 },
  ingredientMention: {
    color: '#1d4ed8',
    backgroundColor: '#eff6ff',
    borderRadius: 4,
  },
  ingredientTooltip: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e4e4e7',
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
  ingredientTooltipText: { fontSize: 14, color: '#111' },
  timerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  timerChipDone: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  timerChipText: { fontSize: 12, fontWeight: '600', color: '#d97706' },
})

export default RecipeDetailScreen
