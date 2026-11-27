import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, ScrollView, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'
import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router'
import { useRecipes } from '@carrot/shared/hooks/useRecipes'
import { useImportJobs } from '@carrot/shared/hooks/useImportJobs'
import AddRecipeDrawer, { type AddRecipeDrawerHandle, type AddRecipeSheet } from '../../components/AddRecipeDrawer'
import { AppText, Button, Card, Thumbnail } from '../../components/ui'
import { useScreenLoading } from '../../hooks/useScreenLoading'
import { useHousehold } from '../../context/HouseholdContext'
import { useAuth } from '../../context/AuthContext'
import { useMotion } from '../../theme'
import AddMenuPopover from './AddMenuPopover'
import ImportsCard from './ImportsCard'
import JumpBackInCard from './JumpBackInCard'
import RecipeShelf from './RecipeShelf'
import TimersCard from './TimersCard'
import TonightCard from './TonightCard'
import { getFavourites, getRecentlyAdded } from './helpers'
import { styles } from './styles'
import { useHomeHeader } from './useHomeHeader'
import type { ImportJobActions } from './useImportJobActions'
import { useOpenAndPaste } from './useOpenAndPaste'

interface EmptyLibraryCardProps {
  onAdd: () => void
}

const EmptyLibraryCard = ({ onAdd }: EmptyLibraryCardProps) => {
  const { t } = useTranslation()
  const { entering } = useMotion()

  return (
    <Animated.View entering={entering} style={styles.emptySection}>
      <Card style={styles.emptyCard}>
        <Thumbnail url={null} size="xs" radiusKey="control" glyph="book.closed" tone="plain" />
        <View style={styles.emptyText}>
          <AppText variant="cardTitle" style={styles.emptyCentered}>
            {t('home.emptyTitle')}
          </AppText>
          <AppText variant="meta" tone="textSecondary" style={styles.emptyCentered}>
            {t('home.emptyBody')}
          </AppText>
        </View>
        <Button label={t('recipes.addARecipe')} size="lg" fullWidth onPress={onAdd} />
      </Card>
    </Animated.View>
  )
}

const HomeScreen = () => {
  const router = useRouter()
  const isFocused = useIsFocused()
  const { t } = useTranslation()
  const { openAddRecipe } = useLocalSearchParams<{ openAddRecipe?: string }>()
  const addRecipeSheetRef = useRef<AddRecipeDrawerHandle>(null)

  const handleOpenSheet = useCallback((sheet: AddRecipeSheet) => addRecipeSheetRef.current?.present(sheet), [])
  const [addMenuVisible, setAddMenuVisible] = useState(false)
  const openAddMenu = useCallback(() => setAddMenuVisible(true), [])
  const closeAddMenu = useCallback(() => setAddMenuVisible(false), [])
  const handleOpenLinkSheet = useCallback(() => handleOpenSheet('link'), [handleOpenSheet])
  const presentTextSheet = useCallback(() => handleOpenSheet('text'), [handleOpenSheet])
  const openAndPaste = useOpenAndPaste(presentTextSheet)

  const { user, loading: authLoading } = useAuth()
  const { isLoadingHouseholds, activeHouseholdId } = useHousehold()
  const dataQueriesEnabled = !authLoading && user !== null && !isLoadingHouseholds && activeHouseholdId != null
  const { recipes, isLoading, isFetching, error } = useRecipes(dataQueriesEnabled)
  const { switchingHousehold } = useHomeHeader({ isFetching, onAddPress: openAddMenu })
  const { busy, showSpinner } = useScreenLoading(isLoading || switchingHousehold)
  const { jobs: importJobs, retry, importAnyway, cancel, dismiss } = useImportJobs(
    user ? `${user.id}:${activeHouseholdId ?? 'personal'}` : null,
  )

  const knownRecipeIdsRef = useRef<Set<string>>(new Set())
  const recipeIdsInitializedRef = useRef(false)

  useEffect(() => {
    if (openAddRecipe !== '1') return
    handleOpenSheet('link')
    router.setParams({ openAddRecipe: undefined })
  }, [handleOpenSheet, openAddRecipe, router])

  useEffect(() => {
    if (isLoading) return

    const recipeIds = new Set(recipes.map((recipe) => recipe.id))
    if (!recipeIdsInitializedRef.current || switchingHousehold) {
      recipeIdsInitializedRef.current = true
      knownRecipeIdsRef.current = recipeIds

      return
    }

    if (!isFocused) return

    const hasNewRecipe = recipes.some((recipe) => !knownRecipeIdsRef.current.has(recipe.id))
    knownRecipeIdsRef.current = recipeIds
    if (hasNewRecipe) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    }
  }, [isFocused, isLoading, recipes, switchingHousehold])

  const handleGoToDuplicateRecipe = useCallback(
    (recipeId: string) => router.push({ pathname: '/recipe/[id]', params: { id: recipeId } }),
    [router],
  )

  const importJobActions: ImportJobActions = useMemo(
    () => ({
      retry: retry.mutateAsync,
      importAnyway: importAnyway.mutateAsync,
      cancel: cancel.mutateAsync,
      dismiss: dismiss.mutateAsync,
      onGoToRecipe: handleGoToDuplicateRecipe,
      onContinueManually: openAndPaste,
    }),
    [
      cancel.mutateAsync,
      dismiss.mutateAsync,
      handleGoToDuplicateRecipe,
      importAnyway.mutateAsync,
      openAndPaste,
      retry.mutateAsync,
    ],
  )

  const recentlyAdded = useMemo(() => getRecentlyAdded(recipes), [recipes])
  const favourites = useMemo(() => getFavourites(recipes), [recipes])
  const isLibraryEmpty = recipes.length === 0 && importJobs.length === 0

  if (busy) {
    return (
      <View style={styles.center}>
        {showSpinner && <ActivityIndicator size="large" accessibilityLabel={t('common.loading')} />}
      </View>
    )
  }

  if (error && !isFetching) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error.message}</Text>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <TonightCard enabled={dataQueriesEnabled} />
        {importJobs.length > 0 ? <ImportsCard jobs={importJobs} recipes={recipes} actions={importJobActions} /> : null}
        <TimersCard />
        <JumpBackInCard recipes={recipes} />
        {recentlyAdded.length > 0 ? (
          <RecipeShelf title={t('home.recentlyAdded')} recipes={recentlyAdded} preset="recent" />
        ) : null}
        {favourites.length > 0 ? (
          <RecipeShelf title={t('home.favourites')} recipes={favourites} preset="favourites" />
        ) : null}
        {isLibraryEmpty ? <EmptyLibraryCard onAdd={handleOpenLinkSheet} /> : null}
      </ScrollView>
      <AddMenuPopover visible={addMenuVisible} onClose={closeAddMenu} onOpenSheet={handleOpenSheet} />
      <AddRecipeDrawer ref={addRecipeSheetRef} />
    </View>
  )
}

export default HomeScreen
