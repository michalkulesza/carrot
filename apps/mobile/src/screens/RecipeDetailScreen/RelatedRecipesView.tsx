import { memo, useCallback, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { SymbolView } from 'expo-symbols'
import { useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { useTranslation } from 'react-i18next'
import { useRecipes } from '@carrot/shared/hooks/useRecipes'
import type { RecipeOut } from '@carrot/shared/types'
import { RecipeTile, SectionHeader } from '../../components/ui'
import { lightHaptic } from '../../components/ui/haptics'
import { palette, useMotion } from '../../theme'
import { formatRecipeMeta } from '@carrot/shared/utils/recipeMeta'
import HeaderAddButton from './HeaderAddButton'
import QuietRow from './QuietRow'
import RelatedRecipesPicker from './RelatedRecipesPicker'
import { styles } from './styles'

const TILE_SIZE = 140
const SECTION_TOP_GAP = 32

interface RelatedTileProps {
  recipe: RecipeOut
  editing: boolean
  onPress?: (id: string) => void
  onRemove: (id: string) => void
}

const RelatedTile = memo(({ recipe, editing, onPress, onRemove }: RelatedTileProps) => {
  const { t } = useTranslation()
  const { entering, exiting, layout } = useMotion()

  const meta = useMemo(() => formatRecipeMeta(recipe, t), [recipe, t])

  const handlePress = useMemo(() => (onPress ? () => onPress(recipe.id) : undefined), [onPress, recipe.id])
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

interface RelatedRecipesViewProps {
  recipeId: string | null
  related: RecipeOut[]
  isSaving: boolean
  editing: boolean
  onSave: (recipes: RecipeOut[]) => void
}

const RelatedRecipesView = ({ recipeId, related, isSaving, editing, onSave }: RelatedRecipesViewProps) => {
  const { t } = useTranslation()
  const router = useRouter()
  const { recipes } = useRecipes(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selected, setSelected] = useState(() => new Set<string>())
  const selectedRef = useRef(new Set<string>())
  const initialSelectedRef = useRef(new Set<string>())
  const navigationInProgressRef = useRef(false)
  const selectedIds = useMemo(() => new Set(related.map((recipe) => recipe.id)), [related])
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

  const handlePickerDismiss = useCallback(() => {
    setPickerOpen(false)

    const current = selectedRef.current
    const initial = initialSelectedRef.current
    const unchanged = current.size === initial.size && [...current].every((id) => initial.has(id))
    if (unchanged) return

    onSave(candidates.filter((recipe) => current.has(recipe.id)))
  }, [candidates, onSave])

  const handleRemoveRelated = useCallback(
    (id: string) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      onSave(related.filter((recipe) => recipe.id !== id))
    },
    [related, onSave],
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

  const { entering, exiting, layout } = useMotion()
  const tilePressHandler = recipeId === null ? undefined : handleRelatedRecipePress
  const showQuietRow = related.length === 0 && !editing
  const actionLabel = editing ? t('recipes.linkRecipe') : t('common.edit')
  const headerAction = showQuietRow ? (
    <HeaderAddButton label={t('relatedRecipes.linkAction')} accessibilityLabel={t('relatedRecipes.linkRecipe')} onPress={openPicker} />
  ) : undefined

  return (
    <View>
      <SectionHeader
        title={t('relatedRecipes.title')}
        topGap={SECTION_TOP_GAP}
        count={related.length > 0 ? String(related.length) : undefined}
        actionLabel={showQuietRow ? undefined : actionLabel}
        onAction={openPicker}
        action={headerAction}
      />
      <Animated.View layout={layout}>
        {showQuietRow ? (
          <Animated.View key="quiet" entering={entering} exiting={exiting} style={styles.quietCard}>
            <QuietRow
              symbol="link"
              title={t('relatedRecipes.emptyTitle')}
              hint={t('relatedRecipes.emptyHint')}
              onPress={openPicker}
            />
          </Animated.View>
        ) : (
          <Animated.View key="tiles" entering={entering} exiting={exiting}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.relatedRecipesRow}>
              {related.map((recipe) => (
                <RelatedTile
                  key={recipe.id}
                  recipe={recipe}
                  editing={editing}
                  onPress={tilePressHandler}
                  onRemove={handleRemoveRelated}
                />
              ))}
              {editing ? <LinkRecipeTile onPress={openPicker} /> : null}
            </ScrollView>
          </Animated.View>
        )}
      </Animated.View>
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

export default memo(RelatedRecipesView)
