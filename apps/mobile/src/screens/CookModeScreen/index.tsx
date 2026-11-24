import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import * as KeepAwake from 'expo-keep-awake'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useRecipes } from '@carrot/shared/hooks/useRecipes'
import { usePreferences, useRecipeServingPreference } from '@carrot/shared/hooks/usePreferences'
import type { RecipeOut } from '@carrot/shared/types'
import { getIngredientQuantityCount } from '@carrot/shared/utils/ingredientUtils'
import { SegmentedControl, type SegmentedControlOption } from '../../components/ui'
import { useResolvedColorScheme } from '../../context/ColorSchemeContext'
import { useIsAppActive } from '../../hooks/useIsAppActive'
import BottomBar from './BottomBar'
import IngredientsTab from './IngredientsTab'
import StepsTab from './StepsTab'
import TabPager from './TabPager'
import TopBar from './TopBar'
import {
  buildCookIngredientGroups,
  buildCookSteps,
  countGathered,
  KEEP_AWAKE_COOK_TAG,
  resolveStepAnchorKeys,
} from './helpers'
import { styles } from './styles'
import useCheckedIngredients from './useCheckedIngredients'
import useCookFontScale from './useCookFontScale'
import useCookSession from './useCookSession'
import useTabPager, { type CookTab } from './useTabPager'

const COUNTED_UNITS = ['cl', 'piece', 'sprig', 'leaf', 'sheet']

const parseIndexParam = (value: string | undefined) => {
  if (value === undefined || value === '') return null
  const parsed = Number(value)

  return Number.isInteger(parsed) ? parsed : null
}

interface CookModeContentProps {
  recipe: RecipeOut
  initialComponentIndex: number | null
  initialStepIndex: number | null
  jumpKey: string
  onClose: () => void
}

const CookModeContent = ({ recipe, initialComponentIndex, initialStepIndex, jumpKey, onClose }: CookModeContentProps) => {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const colorScheme = useResolvedColorScheme()
  const isAppActive = useIsAppActive()
  const { preferences } = usePreferences()
  const { selectedServings } = useRecipeServingPreference(recipe.id, recipe.servings)
  const [pageWidth, setPageWidth] = useState(0)
  const finishingRef = useRef(false)

  const unitSystem = preferences?.unit_system ?? 'metric'
  const servingScale = recipe.servings && selectedServings ? selectedServings / recipe.servings : 1

  const steps = useMemo(() => buildCookSteps(recipe.components), [recipe.components])
  const anchorKeys = useMemo(() => resolveStepAnchorKeys(recipe.components), [recipe.components])

  const translateUnit = useCallback(
    (unit: string, qty: string) =>
      t(`units.${unit}`, {
        count: COUNTED_UNITS.includes(unit) && qty ? getIngredientQuantityCount(qty) : 1,
        defaultValue: unit,
      }),
    [t],
  )

  const groups = useMemo(
    () => buildCookIngredientGroups(recipe.components, unitSystem, servingScale, translateUnit),
    [recipe.components, unitSystem, servingScale, translateUnit],
  )

  const { ready, index, isLastStep, goBy, finish } = useCookSession({
    recipeId: recipe.id,
    steps,
    initialComponentIndex,
    initialStepIndex,
    jumpKey,
  })
  const { fontScale, cycle: cycleFontScale } = useCookFontScale()
  const { checked, toggle: toggleIngredient } = useCheckedIngredients(recipe.id)
  const { tab, progress, selectTab, gesture } = useTabPager(pageWidth)

  useEffect(() => {
    if (!isAppActive) return

    void KeepAwake.activateKeepAwakeAsync(KEEP_AWAKE_COOK_TAG)

    return () => {
      void KeepAwake.deactivateKeepAwake(KEEP_AWAKE_COOK_TAG)
    }
  }, [isAppActive])

  const handleBack = useCallback(() => goBy(-1), [goBy])

  const handleNext = useCallback(() => {
    if (!isLastStep) {
      goBy(1)
      return
    }

    if (finishingRef.current) return

    finishingRef.current = true
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    void finish().finally(onClose)
  }, [finish, goBy, isLastStep, onClose])

  const gatheredCount = countGathered(groups, checked)
  const totalIngredients = groups.reduce((sum, group) => sum + group.ingredients.length, 0)

  const tabOptions = useMemo<SegmentedControlOption<CookTab>[]>(
    () => [
      { value: 'steps', label: t('cookMode.tabSteps') },
      { value: 'ingredients', label: t('cookMode.ingredients'), count: totalIngredients - gatheredCount },
    ],
    [gatheredCount, t, totalIngredients],
  )

  if (!ready || steps.length === 0) return <View style={styles.root} />

  const stepLabel = t('cookMode.stepProgress', { current: index + 1, total: steps.length })
  const swipeHint = tab === 'steps' ? t('cookMode.swipeForIngredients') : t('cookMode.swipeForSteps')
  const nextSmallLabel = isLastStep ? t('cookMode.finish') : t('cookMode.nextStep')
  const nextTitle = isLastStep ? t('cookMode.enjoy') : t('cookMode.stepTitle', { number: index + 2 })

  const stepsPage = <StepsTab recipe={recipe} steps={steps} index={index} fontScale={fontScale} />
  const ingredientsPage = (
    <IngredientsTab
      groups={groups}
      checked={checked}
      fontScale={fontScale}
      anchorKey={anchorKeys[index]}
      stepNumber={index + 1}
      active={tab === 'ingredients'}
      fallbackGroupTitle={t('cookMode.ingredients')}
      onToggle={toggleIngredient}
    />
  )

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} animated />
      <TopBar
        stepLabel={stepLabel}
        closeLabel={t('cookMode.close')}
        textSizeLabel={t('cookMode.textSize')}
        onClose={onClose}
        onCycleTextSize={cycleFontScale}
      />
      <View style={styles.segmentedWrap}>
        <SegmentedControl options={tabOptions} value={tab} onChange={selectTab} progress={progress} />
      </View>
      <TabPager
        progress={progress}
        gesture={gesture}
        width={pageWidth}
        onWidthChange={setPageWidth}
        steps={stepsPage}
        ingredients={ingredientsPage}
      />
      <BottomBar
        swipeHint={swipeHint}
        backLabel={t('cookMode.previousStep')}
        nextSmallLabel={nextSmallLabel}
        nextTitle={nextTitle}
        canGoBack={index > 0}
        onBack={handleBack}
        onNext={handleNext}
      />
    </View>
  )
}

const CookModeScreen = () => {
  const router = useRouter()
  const { id: recipeId, componentIndex, stepIndex, navAt } = useLocalSearchParams<{
    id: string
    componentIndex?: string
    stepIndex?: string
    navAt?: string
  }>()
  const { recipes, isLoading } = useRecipes()

  const recipe = useMemo(() => recipes.find(({ id }) => id === recipeId), [recipes, recipeId])
  const hasSteps = recipe?.components.some((component) => component.steps.length > 0) ?? false

  const handleClose = useCallback(() => {
    if (router.canGoBack()) router.back()
    else router.replace('/(tabs)/home')
  }, [router])

  useEffect(() => {
    if (!isLoading && !hasSteps) handleClose()
  }, [isLoading, hasSteps, handleClose])

  if (!recipe || !hasSteps) return <View style={styles.root} />

  return (
    <CookModeContent
      recipe={recipe}
      initialComponentIndex={parseIndexParam(componentIndex)}
      initialStepIndex={parseIndexParam(stepIndex)}
      jumpKey={navAt ?? ''}
      onClose={handleClose}
    />
  )
}

export default CookModeScreen
