import { memo, useCallback, useMemo, useRef, useState } from 'react'
import { Alert, Pressable, ScrollView, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { SymbolView } from 'expo-symbols'
import { useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '@carrot/shared/api/context'
import { useRecipes } from '@carrot/shared/hooks/useRecipes'
import { useRelatedRecipes } from '@carrot/shared/hooks/useRelatedRecipes'
import type { RecipeOut } from '@carrot/shared/types'
import { RecipeTile, SectionHeader } from '../../components/ui'
import { lightHaptic } from '../../components/ui/haptics'
import { palette, useMotion } from '../../theme'
import { formatRecipeMeta } from './helpers'
import RelatedRecipesPicker from './RelatedRecipesPicker'
import { styles } from './styles'

const TILE_SIZE = 140
const SECTION_TOP_GAP = 32

interface RelatedTileProps {
  recipe: RecipeOut
  editing: boolean
  onPress: (id: string) => void
  onRemove: (id: string) => void
}

const RelatedTile = memo(({ recipe, editing, onPress, onRemove }: RelatedTileProps) => {
  const { t } = useTranslation()
  const { entering, exiting, layout } = useMotion()

  const meta = useMemo(() => formatRecipeMeta(recipe, t), [recipe, t])

  const handlePress = useCallback(() => onPress(recipe.id), [onPress, recipe.id])
  const handleRemove = useCallback(() => {
    lightHaptic()
    onRemove(recipe.id)
  }, [onRemove, recipe.id])

  return (
    <Animated.View entering={entering} exiting={exiting} layout={layout}>
      <RecipeTile title={recipe.title} meta={meta} imageUrl={recipe.thumbnail_url} size={TILE_SIZE} onPress={handlePress} />
      {editing ? (
        <Pressable
          style={styles.relatedRemoveButton}
          onPress={handleRemove}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('relatedRecipes.removeLink', { title: recipe.title })}
        >
          <SymbolView name="xmark" size={12} weight="bold" tintColor={palette.bodyOnCard} />
        </Pressable>
      ) : null}
    </Animated.View>
  )
})

const LinkRecipeTile = memo(({ onPress }: { onPress: () => void }) => {
  const { t } = useTranslation()

  const handlePress = useCallback(() => {
    lightHaptic()
    onPress()
  }, [onPress])

  return (
    <Pressable
      style={styles.relatedAddTile}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={t('relatedRecipes.linkRecipe')}
    >
      <Text style={styles.relatedAddPlus}>+</Text>
      <Text style={styles.relatedAddText}>{t('relatedRecipes.linkRecipe')}</Text>
    </Pressable>
  )
})

interface RelatedRecipesSectionProps {
  recipeId: string
  editing?: boolean
}

const RelatedRecipesSection = ({ recipeId, editing = false }: RelatedRecipesSectionProps) => {
  const { t } = useTranslation()
  const router = useRouter()
  const queryClient = useQueryClient()
  const api = useApiClient()
  const { recipes } = useRecipes(false)
  const { relatedRecipes, refetch } = useRelatedRecipes(recipeId)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selected, setSelected] = useState(() => new Set<string>())
  const selectedRef = useRef(new Set<string>())
  const initialSelectedRef = useRef(new Set<string>())
  const isSavingRef = useRef(false)
  const navigationInProgressRef = useRef(false)
  const [pendingRelatedRecipes, setPendingRelatedRecipes] = useState<RecipeOut[] | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const displayedRelatedRecipes = pendingRelatedRecipes ?? relatedRecipes
  const saveRequestIdRef = useRef(0)
  const queuedRelatedRecipesRef = useRef<RecipeOut[] | null>(null)
  const relatedQueryKey = useMemo(() => ['recipes', recipeId, 'related'] as const, [recipeId])
  const selectedIds = useMemo(() => new Set(displayedRelatedRecipes.map((recipe) => recipe.id)), [displayedRelatedRecipes])
  const candidates = useMemo(() => recipes.filter((recipe) => recipe.id !== recipeId), [recipeId, recipes])

  const openPicker = useCallback(() => {
    const next = new Set(selectedIds)
    initialSelectedRef.current = selectedIds
    selectedRef.current = next
    setSelected(next)
    setPickerOpen(true)
  }, [selectedIds])

  const toggle = useCallback((id: string) => {
    const next = new Set(selectedRef.current)

    if (next.has(id)) next.delete(id); else next.add(id)

    selectedRef.current = next
    setSelected(next)
  }, [])

  const saveRelatedRecipes = useCallback(async (nextRelatedRecipes: RecipeOut[]): Promise<void> => {
    if (isSavingRef.current) {
      queuedRelatedRecipesRef.current = nextRelatedRecipes
      setPendingRelatedRecipes(nextRelatedRecipes)
      return
    }

    const requestId = ++saveRequestIdRef.current
    isSavingRef.current = true
    setPendingRelatedRecipes(nextRelatedRecipes)
    setIsSaving(true)

    try {
      const related = await api.setRelatedRecipes(recipeId, nextRelatedRecipes.map((recipe) => recipe.id))

      if (requestId !== saveRequestIdRef.current) return

      queryClient.setQueryData(relatedQueryKey, related)
      setPendingRelatedRecipes(related)
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

    const queued = queuedRelatedRecipesRef.current
    queuedRelatedRecipesRef.current = null
    if (queued) await saveRelatedRecipes(queued)
  }, [api, queryClient, recipeId, refetch, relatedQueryKey, t])

  const handlePickerDismiss = useCallback(() => {
    setPickerOpen(false)

    const current = selectedRef.current
    const initial = initialSelectedRef.current
    const unchanged = current.size === initial.size && [...current].every((id) => initial.has(id))
    if (unchanged) return

    void saveRelatedRecipes(candidates.filter((recipe) => current.has(recipe.id)))
  }, [candidates, saveRelatedRecipes])

  const handleRemoveRelated = useCallback(
    (id: string) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      void saveRelatedRecipes(displayedRelatedRecipes.filter((recipe) => recipe.id !== id))
    },
    [displayedRelatedRecipes, saveRelatedRecipes],
  )

  const handleRelatedRecipePress = useCallback((id: string) => {
    if (navigationInProgressRef.current) return

    navigationInProgressRef.current = true
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    router.navigate(`/recipe/${id}`)

    setTimeout(() => {
      navigationInProgressRef.current = false
    }, 500)
  }, [router])

  const actionLabel = editing ? t('recipes.linkRecipe') : t('common.edit')

  return (
    <View>
      <SectionHeader
        title={t('relatedRecipes.title')}
        topGap={SECTION_TOP_GAP}
        count={displayedRelatedRecipes.length > 0 ? String(displayedRelatedRecipes.length) : undefined}
        actionLabel={actionLabel}
        onAction={openPicker}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.relatedRecipesRow}>
        {displayedRelatedRecipes.map((recipe) => (
          <RelatedTile
            key={recipe.id}
            recipe={recipe}
            editing={editing}
            onPress={handleRelatedRecipePress}
            onRemove={handleRemoveRelated}
          />
        ))}
        {editing ? <LinkRecipeTile onPress={openPicker} /> : null}
      </ScrollView>
      <RelatedRecipesPicker
        visible={pickerOpen}
        candidates={candidates}
        selected={selected}
        disabled={isSaving}
        onToggle={toggle}
        onDismiss={handlePickerDismiss}
      />
    </View>
  )
}

export default RelatedRecipesSection
