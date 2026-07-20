import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Image, PlatformColor, Pressable, ScrollView, Text, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { BottomSheetBackdrop, BottomSheetFlatList, BottomSheetModal, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet'
import { useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '@carrot/shared/api/context'
import { useRecipes } from '@carrot/shared/hooks/useRecipes'
import { useRelatedRecipes } from '@carrot/shared/hooks/useRelatedRecipes'
import type { RecipeOut } from '@carrot/shared/types'
import { proxyThumbnailUrl, PLACEHOLDER_URL } from '../../api/thumbnailUrl'
import CheckboxIcon from '../../components/CheckboxIcon'
import MarqueeText from '../../components/MarqueeText'
import { MarqueeSyncProvider, MarqueeSyncSlots } from '../../components/MarqueeSync'
import { styles } from './styles'

const RelatedRecipeCard = ({
  recipe,
  onPress,
}: {
  recipe: RecipeOut
  onPress: () => void
}) => {
  const uri = proxyThumbnailUrl(recipe.thumbnail_url) || PLACEHOLDER_URL

  return (
    <Pressable
      style={styles.relatedRecipeCard}
      onPress={onPress}
      accessibilityLabel={recipe.title}
      accessibilityRole="link"
    >
      {uri ? <Image source={{ uri }} style={styles.relatedRecipeImage} /> : <View style={styles.relatedRecipeImage} />}
      <MarqueeSyncSlots>
        {({ title: titleTurn }) => (
          <MarqueeText
            text={recipe.title}
            style={styles.relatedRecipeTitle}
            containerStyle={styles.relatedRecipeTitleContainer}
            turn={titleTurn.turn}
            onOverflowChange={titleTurn.onOverflowChange}
            onDone={titleTurn.onDone}
          />
        )}
      </MarqueeSyncSlots>
    </Pressable>
  )
}

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
      Alert.alert(t('common.ok'), t('addRecipe.saveError'))
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
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{t('relatedRecipes.title')}</Text>
      <MarqueeSyncProvider>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.relatedRecipesRow}>
          {displayedRelatedRecipes.map((recipe) => (
            <RelatedRecipeCard
              key={recipe.id}
              recipe={recipe}
              onPress={() => handleRelatedRecipePress(recipe.id)}
            />
          ))}
          <Pressable style={styles.relatedRecipeAdd} onPress={openPicker} accessibilityLabel={t('common.edit')} accessibilityRole="button">
            <Feather name="edit-2" size={16} color={PlatformColor('systemBlue') as unknown as string} />
            <Text style={styles.relatedRecipeAddText}>{t('common.edit')}</Text>
          </Pressable>
        </ScrollView>
      </MarqueeSyncProvider>
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
