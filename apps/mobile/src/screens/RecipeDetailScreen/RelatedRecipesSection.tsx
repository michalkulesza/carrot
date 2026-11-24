import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Pressable, ScrollView, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { BottomSheetBackdrop, BottomSheetFlatList, BottomSheetModal, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet'
import { useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '@carrot/shared/api/context'
import { useRecipes } from '@carrot/shared/hooks/useRecipes'
import { useRelatedRecipes } from '@carrot/shared/hooks/useRelatedRecipes'
import type { RecipeOut } from '@carrot/shared/types'
import CheckboxIcon from '../../components/CheckboxIcon'
import { RecipeTile, SectionHeader } from '../../components/ui'
import { useMotion } from '../../theme'
import { styles } from './styles'

const TILE_SIZE = 140
const SECTION_TOP_GAP = 32

const RelatedTile = memo(({ recipe, onPress }: { recipe: RecipeOut; onPress: (id: string) => void }) => {
  const { t } = useTranslation()
  const { entering, exiting, layout } = useMotion()

  const meta = useMemo(
    () =>
      [
        recipe.total_time_minutes ? t('browse.minutes', { count: recipe.total_time_minutes }) : null,
        recipe.kcal_per_serving ? t('browse.kcal', { count: recipe.kcal_per_serving }) : null,
      ]
        .filter(Boolean)
        .join(' · '),
    [recipe.total_time_minutes, recipe.kcal_per_serving, t],
  )

  const handlePress = useCallback(() => onPress(recipe.id), [onPress, recipe.id])

  return (
    <Animated.View entering={entering} exiting={exiting} layout={layout}>
      <RecipeTile title={recipe.title} meta={meta} imageUrl={recipe.thumbnail_url} size={TILE_SIZE} onPress={handlePress} />
    </Animated.View>
  )
})

const RelatedRecipesSection = ({ recipeId }: { recipeId: string }) => {
  const { t } = useTranslation()
  const router = useRouter()
  const queryClient = useQueryClient()
  const api = useApiClient()
  const { recipes } = useRecipes(false)
  const { relatedRecipes, refetch } = useRelatedRecipes(recipeId)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selected, setSelected] = useState(() => new Set<string>())
  const selectedRef = useRef(new Set<string>())
  const pickerRef = useRef<BottomSheetModal>(null)
  const isSavingRef = useRef(false)
  const navigationInProgressRef = useRef(false)
  const [pendingRelatedRecipes, setPendingRelatedRecipes] = useState<RecipeOut[] | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const displayedRelatedRecipes = pendingRelatedRecipes ?? relatedRecipes
  const saveRequestIdRef = useRef(0)
  const relatedQueryKey = ['recipes', recipeId, 'related'] as const
  const selectedIds = useMemo(() => new Set(displayedRelatedRecipes.map((recipe) => recipe.id)), [displayedRelatedRecipes])
  const candidates = useMemo(() => recipes.filter((recipe) => recipe.id !== recipeId), [recipeId, recipes])

  const openPicker = useCallback(() => {
    const next = new Set(selectedIds)
    selectedRef.current = next
    setSelected(next)
    setPickerOpen(true)
  }, [selectedIds])

  const handlePickerDismiss = useCallback(() => {
    setPickerOpen(false)
  }, [])

  useEffect(() => {
    if (pickerOpen) pickerRef.current?.present()
  }, [pickerOpen])

  const toggle = useCallback((id: string) => {
    const next = new Set(selectedRef.current)

    if (next.has(id)) next.delete(id); else next.add(id)

    selectedRef.current = next
    setSelected(next)
  }, [])

  const saveRelatedRecipes = useCallback(async (nextRelatedRecipes: RecipeOut[], closePicker = false) => {
    if (isSavingRef.current) return

    const requestId = ++saveRequestIdRef.current
    isSavingRef.current = true
    setPendingRelatedRecipes(nextRelatedRecipes)
    setIsSaving(true)

    try {
      const related = await api.setRelatedRecipes(recipeId, nextRelatedRecipes.map((recipe) => recipe.id))

      if (requestId !== saveRequestIdRef.current) return

      queryClient.setQueryData(relatedQueryKey, related)
      setPendingRelatedRecipes(related)
      if (closePicker) pickerRef.current?.dismiss()
      void refetch()
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch {
      if (requestId !== saveRequestIdRef.current) return

      setPendingRelatedRecipes(null)
      void queryClient.invalidateQueries({ queryKey: relatedQueryKey })
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      Alert.alert(t('common.somethingWentWrong'), t('addRecipe.saveError'))
    } finally {
      if (requestId === saveRequestIdRef.current) {
        isSavingRef.current = false
        setIsSaving(false)
      }
    }
  }, [api, queryClient, recipeId, refetch, relatedQueryKey, t])

  const done = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    void saveRelatedRecipes(candidates.filter((recipe) => selectedRef.current.has(recipe.id)), true)
  }, [candidates, saveRelatedRecipes])

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
    ),
    [],
  )

  const renderCandidate = useCallback(({ item: recipe }: { item: RecipeOut }) => {
    const isSelected = selected.has(recipe.id)

    return (
      <Pressable
        style={styles.relatedPickerRow}
        onPress={() => toggle(recipe.id)}
        disabled={isSaving}
        accessibilityLabel={recipe.title}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isSelected, disabled: isSaving }}
      >
        <Text style={styles.relatedPickerRowTitle}>{recipe.title}</Text>
        <CheckboxIcon checked={isSelected} />
      </Pressable>
    )
  }, [isSaving, selected, toggle])

  const handleRelatedRecipePress = useCallback((id: string) => {
    if (navigationInProgressRef.current) return

    navigationInProgressRef.current = true
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    router.navigate(`/recipe/${id}`)

    setTimeout(() => {
      navigationInProgressRef.current = false
    }, 500)
  }, [router])

  return (
    <View>
      <SectionHeader
        title={t('relatedRecipes.title')}
        topGap={SECTION_TOP_GAP}
        count={displayedRelatedRecipes.length > 0 ? String(displayedRelatedRecipes.length) : undefined}
        actionLabel={t('common.edit')}
        onAction={openPicker}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.relatedRecipesRow}>
        {displayedRelatedRecipes.map((recipe) => (
          <RelatedTile key={recipe.id} recipe={recipe} onPress={handleRelatedRecipePress} />
        ))}
      </ScrollView>
      <BottomSheetModal
        ref={pickerRef}
        snapPoints={['72%']}
        enableDynamicSizing={false}
        enablePanDownToClose
        onDismiss={handlePickerDismiss}
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.relatedPickerSheetBackground}
        handleIndicatorStyle={styles.relatedPickerSheetHandle}
      >
        <View style={styles.relatedPicker}>
          <Text style={styles.relatedPickerTitle}>{t('relatedRecipes.add')}</Text>
          <BottomSheetFlatList
            data={candidates}
            renderItem={renderCandidate}
            keyExtractor={(recipe) => recipe.id}
            keyboardShouldPersistTaps="handled"
          />
          <Pressable style={styles.relatedPickerDone} onPress={done} disabled={isSaving} accessibilityRole="button">
            <Text style={styles.relatedPickerDoneText}>{t('common.done')}</Text>
          </Pressable>
        </View>
      </BottomSheetModal>
    </View>
  )
}

export default RelatedRecipesSection
