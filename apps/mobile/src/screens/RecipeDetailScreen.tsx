import { useCallback, useLayoutEffect, useMemo } from 'react'
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { Feather } from '@expo/vector-icons'
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
import type { RecipeOut, SaveComponent, Ingredient } from '@platekeeper/shared/types'

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

// ── Step row with optional timer ───────────────────────────────────────────────

const StepRow = ({
  step,
  index,
  recipe,
  componentIndex,
}: {
  step: string
  index: number
  recipe: RecipeOut
  componentIndex: number
}) => {
  const durationMatch = useMemo(() => parseDurationMatch(step), [step])
  const timerId = `${recipe.id}-c${componentIndex}-s${index}`

  return (
    <View style={styles.stepRow}>
      <Text style={styles.stepNum}>{index + 1}.</Text>
      <View style={styles.stepBody}>
        <Text style={styles.stepText}>{step}</Text>
        {durationMatch && (
          <TimerButton
            timerId={timerId}
            recipe={recipe}
            componentIndex={componentIndex}
            stepIndex={index}
            stepText={step}
            seconds={durationMatch.seconds}
          />
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
            />
          ))}
        </View>
      )}
    </View>
  )
}

// ── Main screen ────────────────────────────────────────────────────────────────

const RecipeDetailScreen = ({ route, navigation }: Props) => {
  const { recipeId } = route.params
  const { t } = useTranslation()
  const { recipes, isLoading, error } = useRecipes()

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
  }, [navigation, handleEdit, t])

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
  stepText: { fontSize: 15, color: '#111', lineHeight: 22 },
  timerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
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
