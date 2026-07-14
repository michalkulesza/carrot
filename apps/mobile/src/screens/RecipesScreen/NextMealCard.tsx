import { useCallback } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useNextMealPlanEntry } from '@carrot/shared/hooks/useNextMealPlanEntry'
import { formatNextMealDate } from '@carrot/shared/utils/dateUtils'
import { colors } from '../../theme/colors'
import ThumbnailImage from './ThumbnailImage'
import { styles } from './styles'

const NextMealCard = () => {
  const router = useRouter()
  const { t, i18n } = useTranslation()
  const { entry, todayIso, isLoading, error, refetch } = useNextMealPlanEntry()

  const handleOpen = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    if (entry) {
      router.push({
        pathname: '/recipe/[id]',
        params: { id: entry.recipe.id, title: entry.recipe.title },
      })

      return
    }

    router.push({
      pathname: '/(tabs)/meal-plan',
      params: { focusToday: String(Date.now()) },
    })
  }, [entry, router])

  const handleRetry = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    await refetch()
  }, [refetch])

  const getPressableStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [
      styles.nextMealCard,
      pressed && styles.nextMealCardPressed,
    ],
    [],
  )

  if (isLoading) {
    return (
      <View
        style={[styles.nextMealCard, styles.nextMealSkeleton]}
        accessibilityLabel={t('common.loading')}
      >
        <View style={styles.nextMealSkeletonImage} />
        <View style={styles.nextMealBody}>
          <View style={styles.nextMealSkeletonLabel} />
          <View style={styles.nextMealSkeletonTitle} />
        </View>
      </View>
    )
  }

  if (error) {
    return (
      <Pressable
        style={getPressableStyle}
        onPress={handleRetry}
        accessibilityLabel={`${t('nextMeal.error')}. ${t('nextMeal.retry')}`}
        accessibilityRole="button"
      >
        <View style={styles.nextMealFallbackIcon}>
          <Ionicons name="refresh" size={22} color={colors.red} />
        </View>
        <View style={styles.nextMealBody}>
          <Text style={styles.nextMealError}>{t('nextMeal.error')}</Text>
          <Text style={styles.nextMealAction}>{t('nextMeal.retry')}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.tertiaryLabel} />
      </Pressable>
    )
  }

  if (!entry) {
    return (
      <Pressable
        style={getPressableStyle}
        onPress={handleOpen}
        accessibilityLabel={`${t('nextMeal.empty')}. ${t('nextMeal.openPlan')}`}
        accessibilityRole="button"
      >
        <View style={styles.nextMealFallbackIcon}>
          <Ionicons name="calendar-outline" size={22} color={colors.blue} />
        </View>
        <View style={styles.nextMealBody}>
          <Text style={styles.nextMealRecipeTitle}>{t('nextMeal.empty')}</Text>
          <Text style={styles.nextMealAction}>{t('nextMeal.openPlan')}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.tertiaryLabel} />
      </Pressable>
    )
  }

  const dateLabel = formatNextMealDate(
    entry.date,
    todayIso,
    i18n.language,
    t('nextMeal.today'),
    t('nextMeal.tomorrow'),
  )
  const accessibilityLabel = `${t('nextMeal.title')}: ${entry.recipe.title}, ${dateLabel}`

  return (
    <Pressable
      style={getPressableStyle}
      onPress={handleOpen}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
    >
      {entry.recipe.thumbnail_url ? (
        <ThumbnailImage url={entry.recipe.thumbnail_url} style={styles.nextMealImage} />
      ) : (
        <View style={styles.nextMealFallbackIcon}>
          <Ionicons name="restaurant-outline" size={22} color={colors.blue} />
        </View>
      )}
      <View style={styles.nextMealBody}>
        <Text style={styles.nextMealLabel}>{t('nextMeal.title')}</Text>
        <Text style={styles.nextMealRecipeTitle} numberOfLines={1}>
          {entry.recipe.title}
        </Text>
        <Text style={styles.nextMealDate}>{dateLabel}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.tertiaryLabel} />
    </Pressable>
  )
}

export default NextMealCard
