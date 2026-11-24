import { useCallback, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { SymbolView } from 'expo-symbols'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useNextMealPlanEntry } from '@carrot/shared/hooks/useNextMealPlanEntry'
import type { MealPlanEntry } from '@carrot/shared/types'
import ThumbnailImage from '../../components/ThumbnailImage'
import { AppText, Button, Card } from '../../components/ui'
import { imageScrim, palette, useMotion } from '../../theme'
import { getTonightKicker } from './helpers'
import TonightEmptyCard from './TonightEmptyCard'
import { styles } from './styles'

type TonightState = 'loading' | 'error' | 'empty' | 'entry'

interface TonightEntryCardProps {
  entry: MealPlanEntry
  todayIso: string
  onOpen: () => void
}

const TonightEntryCard = ({ entry, todayIso, onOpen }: TonightEntryCardProps) => {
  const { t, i18n } = useTranslation()
  const { recipe } = entry
  const hasPhoto = Boolean(recipe?.thumbnail_url)
  const title = recipe?.title ?? entry.text ?? ''
  const kicker = getTonightKicker(entry.date, todayIso, recipe?.total_time_minutes, i18n.language, t)
  const accessibilityLabel = `${kicker}: ${title}`
  const kickerTone = hasPhoto ? 'onImage' : 'actionText'
  const titleTone = hasPhoto ? 'onImage' : 'ink'

  return (
    <Card tone="default" onPress={onOpen} accessibilityLabel={accessibilityLabel} style={styles.tonightCard}>
      {hasPhoto ? (
        <>
          <ThumbnailImage url={recipe?.thumbnail_url ?? null} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={imageScrim} style={StyleSheet.absoluteFill} />
        </>
      ) : null}
      <View style={styles.tonightContent}>
        <View style={styles.tonightText}>
          <AppText variant="kicker" tone={kickerTone}>
            {kicker}
          </AppText>
          <AppText variant="heroTitle" tone={titleTone} numberOfLines={2}>
            {title}
          </AppText>
        </View>
        {recipe ? (
          <Button label={t('home.open')} variant={hasPhoto ? 'onImage' : 'primary'} onPress={onOpen} />
        ) : null}
      </View>
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
  const { entry, todayIso, isLoading, error, refetch } = useNextMealPlanEntry(enabled)
  const retrying = useRef(false)

  const handleOpen = useCallback(() => {
    if (entry?.recipe) {
      router.push({ pathname: '/recipe/[id]', params: { id: entry.recipe.id, title: entry.recipe.title } })

      return
    }

    router.push({ pathname: '/(tabs)/meal-plan', params: { focusToday: String(Date.now()) } })
  }, [entry, router])

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

  const state: TonightState = !enabled || isLoading ? 'loading' : error ? 'error' : entry ? 'entry' : 'empty'

  return (
    <Animated.View key={state} entering={entering} exiting={exiting} style={styles.tonightSection}>
      {state === 'loading' ? <TonightSkeleton /> : null}
      {state === 'error' ? <TonightErrorCard onRetry={handleRetry} /> : null}
      {state === 'empty' ? <TonightEmptyCard onPlanTonight={handlePlanTonight} onOpenMealPlan={handleOpenMealPlan} /> : null}
      {state === 'entry' && entry ? (
        <TonightEntryCard entry={entry} todayIso={todayIso} onOpen={handleOpen} />
      ) : null}
    </Animated.View>
  )
}

export default TonightCard
