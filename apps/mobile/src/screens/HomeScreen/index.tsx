import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'
import { useIsFocused, useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import { useRecipes } from '@carrot/shared/hooks/useRecipes'
import { useImportJobs } from '@carrot/shared/hooks/useImportJobs'
import HouseholdHeaderTitle from '../../components/HouseholdHeaderTitle'
import AddRecipeDrawer, { type AddRecipeDrawerHandle } from '../../components/AddRecipeDrawer'
import { clearImportImagePreview } from '../../utils/importImagePreviews'
import { useScreenLoading } from '../../hooks/useScreenLoading'
import { useHouseholdMenu } from '../../hooks/useHouseholdMenu'
import { useHousehold } from '../../context/HouseholdContext'
import { useAuth } from '../../context/AuthContext'
import FloatingAddButton from './FloatingAddButton'
import ImportJobsSection from './ImportJobsSection'
import NextMealCard from './NextMealCard'
import RecipeShelf from './RecipeShelf'
import { getFavourites, getRecentlyAdded } from './helpers'
import { styles } from './styles'
import { useOpenAndPaste } from './useOpenAndPaste'

const HomeScreen = () => {
  const navigation = useNavigation()
  const router = useRouter()
  const isFocused = useIsFocused()
  const { t } = useTranslation()
  const { openAddRecipe } = useLocalSearchParams<{ openAddRecipe?: string }>()
  const addRecipeSheetRef = useRef<AddRecipeDrawerHandle>(null)
  const presentTextImport = useCallback(() => addRecipeSheetRef.current?.presentTextImport(), [])
  const openAndPaste = useOpenAndPaste(presentTextImport)

  const { user, loading: authLoading } = useAuth()
  const { isLoadingHouseholds, activeHouseholdId, activeHousehold } = useHousehold()
  const dataQueriesEnabled = !authLoading && user !== null && !isLoadingHouseholds && activeHouseholdId != null
  const { recipes, isLoading, isFetching, error } = useRecipes(dataQueriesEnabled)
  const { householdMenuActions, handleHouseholdAction, handleHouseholdMenuOpen, switchingHousehold } =
    useHouseholdMenu(isFetching)
  const { busy, showSpinner } = useScreenLoading(isLoading || switchingHousehold)
  const { jobs: importJobs, retry, importAnyway, cancel, dismiss } = useImportJobs(
    user ? `${user.id}:${activeHouseholdId ?? 'personal'}` : null,
  )

  const knownRecipeIdsRef = useRef<Set<string>>(new Set())
  const recipeIdsInitializedRef = useRef(false)
  const previousJobIds = useRef<string[]>([])

  useEffect(() => {
    if (openAddRecipe !== '1') return
    addRecipeSheetRef.current?.present()
    router.setParams({ openAddRecipe: undefined })
  }, [openAddRecipe, router])

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

  useEffect(() => {
    const currentIds = new Set(importJobs.map((job) => job.id))
    previousJobIds.current.filter((id) => !currentIds.has(id)).forEach(clearImportImagePreview)
    previousJobIds.current = [...currentIds]
  }, [importJobs])

  const homeTitle = t('nav.home')
  const switchContextLabel = t('households.switchContext')

  const renderHeaderTitle = useCallback(
    () => (
      <HouseholdHeaderTitle
        title={homeTitle}
        householdMenuActions={householdMenuActions}
        onHouseholdAction={handleHouseholdAction}
        onHouseholdMenuOpen={handleHouseholdMenuOpen}
        activeHousehold={activeHousehold}
        switchContextLabel={switchContextLabel}
        isLoadingHouseholds={isLoadingHouseholds}
      />
    ),
    [
      activeHousehold,
      handleHouseholdAction,
      handleHouseholdMenuOpen,
      homeTitle,
      householdMenuActions,
      isLoadingHouseholds,
      switchContextLabel,
    ],
  )

  useLayoutEffect(() => {
    const headerOptions = { title: homeTitle, headerTitle: renderHeaderTitle }

    navigation.setOptions(headerOptions)
  }, [homeTitle, navigation, renderHeaderTitle])

  const handleGoToDuplicateRecipe = useCallback(
    (recipeId: string) => router.push({ pathname: '/recipe/[id]', params: { id: recipeId } }),
    [router],
  )
  const handleOpenDrawer = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    addRecipeSheetRef.current?.present()
  }, [])

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
        <NextMealCard enabled={dataQueriesEnabled} />
        <ImportJobsSection
          jobs={importJobs}
          retry={retry}
          importAnyway={importAnyway}
          cancel={cancel}
          dismiss={dismiss}
          onGoToRecipe={handleGoToDuplicateRecipe}
          onContinueManually={openAndPaste}
        />
        {recentlyAdded.length > 0 && <RecipeShelf title={t('home.recentlyAdded')} recipes={recentlyAdded} preset="recent" />}
        {favourites.length > 0 && <RecipeShelf title={t('home.favourites')} recipes={favourites} preset="favourites" />}
        {isLibraryEmpty && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{t('home.emptyTitle')}</Text>
            <Text style={styles.emptyBody}>{t('home.emptyBody')}</Text>
            <Pressable
              onPress={handleOpenDrawer}
              style={styles.addRecipeButton}
              accessibilityLabel={t('recipes.addARecipe')}
              accessibilityRole="button"
            >
              <Text style={styles.addRecipeButtonText}>{t('recipes.addARecipe')}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
      <FloatingAddButton accessibilityLabel={t('nav.addRecipe')} sheetRef={addRecipeSheetRef} />
      <AddRecipeDrawer ref={addRecipeSheetRef} />
    </View>
  )
}

export default HomeScreen
