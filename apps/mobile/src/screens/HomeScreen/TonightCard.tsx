import { useCallback, useRef } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { SymbolView } from 'expo-symbols'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useNextMealPlanDay } from '@carrot/shared/hooks/useNextMealPlanDay'
import type { MealPlanEntry } from '@carrot/shared/types'
import ThumbnailImage from '../../components/ThumbnailImage'
import { AppText, Button, Card, CardRowList } from '../../components/ui'
import { useTapGuard } from '../../hooks/useTapGuard'
import { imageScrim, palette, useMotion } from '../../theme'
import { getCourseLabel, getTonightKicker, getTonightState } from './helpers'
import TonightDishRow from './TonightDishRow'
import TonightEmptyCard from './TonightEmptyCard'
import { styles } from './styles'
import { useTonightDish } from './useTonightDish'

interface TonightHeroBackdropProps {
  url: string
}

const TonightHeroBackdrop = ({ url }: TonightHeroBackdropProps) => (
  <>
    <ThumbnailImage url={url} style={StyleSheet.absoluteFill} />
    <LinearGradient colors={imageScrim} style={StyleSheet.absoluteFill} />
  </>
)

interface TonightHeroProps {
  entry: MealPlanEntry
  todayIso: string
  compact: boolean
  onOpen: (entry: MealPlanEntry) => void
  onCook: (entry: MealPlanEntry) => void
}

const TonightHero = ({ entry, todayIso, compact, onOpen, onCook }: TonightHeroProps) => {
  const { t, i18n } = useTranslation()
  const { recipe, title, cookLabel, handleOpen, handleCook } = useTonightDish(entry, onOpen, onCook)
  const thumbnailUrl = recipe?.thumbnail_url
  const hasPhoto = Boolean(thumbnailUrl)
  const course = compact ? getCourseLabel(entry, 0, t) : undefined
  const kicker = getTonightKicker(entry.date, todayIso, recipe?.total_time_minutes, i18n.language, t, course)
  const accessibilityLabel = `${kicker}: ${title}`
  const kickerTone = hasPhoto ? 'onImage' : 'actionText'
  const titleTone = hasPhoto ? 'onImage' : 'ink'
  const heroStyle = compact ? [styles.tonightHero, styles.tonightHeroCompact] : styles.tonightHero

  return (
    <Pressable accessible={false} onPress={handleOpen} style={heroStyle}>
      {thumbnailUrl ? <TonightHeroBackdrop url={thumbnailUrl} /> : null}
      <View style={styles.tonightContent}>
        <Pressable
          style={styles.tonightText}
          onPress={handleOpen}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
        >
          <AppText variant="kicker" tone={kickerTone}>
            {kicker}
          </AppText>
          <AppText variant="heroTitle" tone={titleTone} numberOfLines={2}>
            {title}
          </AppText>
        </Pressable>
        {recipe ? (
          <Button
            label={t('home.cook')}
            icon="play.fill"
            variant={hasPhoto ? 'onImage' : 'primary'}
            accessibilityLabel={cookLabel}
            onPress={handleCook}
          />
        ) : null}
      </View>
    </Pressable>
  )
}

interface TonightDayCardProps {
  entries: MealPlanEntry[]
  todayIso: string
  onOpen: (entry: MealPlanEntry) => void
  onCook: (entry: MealPlanEntry) => void
}

const TonightDayCard = ({ entries, todayIso, onOpen, onCook }: TonightDayCardProps) => {
  const [hero, ...sides] = entries
  const compact = sides.length > 0

  const keyExtractor = useCallback((entry: MealPlanEntry) => entry.id, [])
  const renderRow = useCallback(
    (entry: MealPlanEntry, index: number) => (
      <TonightDishRow entry={entry} index={index + 1} onOpen={onOpen} onCook={onCook} />
    ),
    [onOpen, onCook],
  )

  return (
    <Card tone="default" style={styles.tonightSurface}>
      <TonightHero entry={hero} todayIso={todayIso} compact={compact} onOpen={onOpen} onCook={onCook} />
      {compact ? (
        <View style={styles.tonightRows}>
          <CardRowList items={sides} keyExtractor={keyExtractor} renderItem={renderRow} />
        </View>
      ) : null}
    </Card>
  )
}

interface TonightErrorCardProps {
  onRetry: () => void
}

const TonightErrorCard = ({ onRetry }: TonightErrorCardProps) => {
  const { t } = useTranslation()

  return (
    <Card
      tone="error"
      onPress={onRetry}
      accessibilityLabel={`${t('nextMeal.error')}. ${t('nextMeal.retry')}`}
    >
      <View style={styles.tonightErrorRow}>
        <SymbolView name="arrow.clockwise" size={20} weight="semibold" tintColor={palette.error} />
        <View style={styles.flexFill}>
          <AppText variant="rowTitle" tone="error">
            {t('nextMeal.error')}
          </AppText>
          <AppText variant="meta" tone="textSecondary">
            {t('nextMeal.retry')}
          </AppText>
        </View>
      </View>
    </Card>
  )
}

const TonightSkeleton = () => {
  const { t } = useTranslation()

  return (
    <View accessibilityLabel={t('common.loading')}>
      <Card style={styles.tonightCard} />
    </View>
  )
}

interface TonightCardProps {
  enabled: boolean
}

const TonightCard = ({ enabled }: TonightCardProps) => {
  const router = useRouter()
  const { entering, exiting } = useMotion()
  const { entries, todayIso, isLoading, error, refetch } = useNextMealPlanDay(enabled)
  const retrying = useRef(false)
  const guardNavigation = useTapGuard()

  const handleOpen = useCallback(
    (entry: MealPlanEntry) => {
      if (!guardNavigation()) return

      if (entry.recipe) {
        router.push({ pathname: '/recipe/[id]', params: { id: entry.recipe.id, title: entry.recipe.title } })

        return
      }

      router.push({ pathname: '/(tabs)/meal-plan', params: { focusToday: String(Date.now()) } })
    },
    [guardNavigation, router],
  )

  const handleCook = useCallback(
    (entry: MealPlanEntry) => {
      if (!entry.recipe || !guardNavigation()) return

      router.push({ pathname: '/recipe/[id]/cook', params: { id: entry.recipe.id, title: entry.recipe.title } })
    },
    [guardNavigation, router],
  )

  const handleOpenMealPlan = useCallback(
    () => router.push({ pathname: '/(tabs)/meal-plan', params: { focusToday: String(Date.now()) } }),
    [router],
  )

  const handlePlanTonight = useCallback(
    () => router.push({ pathname: '/(tabs)/meal-plan', params: { planToday: String(Date.now()) } }),
    [router],
  )

  const handleRetry = useCallback(async () => {
    if (retrying.current) return
    retrying.current = true

    try {
      await refetch()
    } finally {
      retrying.current = false
    }
  }, [refetch])

  const state = getTonightState(enabled, isLoading, Boolean(error), entries.length)

  return (
    <Animated.View key={state} entering={entering} exiting={exiting} style={styles.tonightSection}>
      {state === 'loading' ? <TonightSkeleton /> : null}
      {state === 'error' ? <TonightErrorCard onRetry={handleRetry} /> : null}
      {state === 'empty' ? <TonightEmptyCard onPlanTonight={handlePlanTonight} onOpenMealPlan={handleOpenMealPlan} /> : null}
      {state === 'entry' ? (
        <TonightDayCard entries={entries} todayIso={todayIso} onOpen={handleOpen} onCook={handleCook} />
      ) : null}
    </Animated.View>
  )
}

export default TonightCard
