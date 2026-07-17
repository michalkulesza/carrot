import { useMemo, useRef, useState } from 'react'
import { Alert, Image, Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { MenuView, type MenuAction } from '@react-native-menu/menu'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '@carrot/shared/api/context'
import { useRecipes } from '@carrot/shared/hooks/useRecipes'
import { useRelatedRecipes } from '@carrot/shared/hooks/useRelatedRecipes'
import type { RecipeOut } from '@carrot/shared/types'
import { proxyThumbnailUrl, PLACEHOLDER_URL } from '../../api/thumbnailUrl'
import MarqueeText from '../../components/MarqueeText'
import { MarqueeSyncProvider, MarqueeSyncSlots } from '../../components/MarqueeSync'
import { styles } from './styles'

const RelatedRecipeCard = ({
  recipe,
  actions,
  onPress,
  onRemove,
}: {
  recipe: RecipeOut
  actions: MenuAction[]
  onPress: () => void
  onRemove: () => void
}) => {
  const uri = proxyThumbnailUrl(recipe.thumbnail_url) || PLACEHOLDER_URL
  return (
    <MenuView
      title={recipe.title}
      actions={actions}
      shouldOpenOnLongPress
      onPressAction={({ nativeEvent }) => {
        if (nativeEvent.event === 'remove') onRemove()
      }}
    >
      <Pressable style={styles.relatedRecipeCard} onPress={onPress}>
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
    </MenuView>
  )
}

const RelatedRecipesSection = ({ recipeId }: { recipeId: string }) => {
  const { t } = useTranslation()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const api = useApiClient()
  const { recipes } = useRecipes(false)
  const { relatedRecipes, refetch } = useRelatedRecipes(recipeId)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selected, setSelected] = useState(() => new Set<string>())
  const selectedRef = useRef(new Set<string>())
  const [pendingRelatedRecipes, setPendingRelatedRecipes] = useState<RecipeOut[] | null>(null)
  const displayedRelatedRecipes = pendingRelatedRecipes ?? relatedRecipes
  const relatedQueryKey = ['recipes', recipeId, 'related'] as const
  const selectedIds = useMemo(() => new Set(displayedRelatedRecipes.map((recipe) => recipe.id)), [displayedRelatedRecipes])
  const relatedRecipeActions = useMemo<MenuAction[]>(() => [{
    id: 'remove',
    title: t('common.remove'),
    image: 'trash',
    attributes: { destructive: true },
  }], [t])
  const openPicker = () => {
    const next = new Set(selectedIds)
    selectedRef.current = next
    setSelected(next)
    setPickerOpen(true)
  }
  const toggle = (id: string) => {
    const next = new Set(selectedRef.current)
    if (next.has(id)) next.delete(id); else next.add(id)
    selectedRef.current = next
    setSelected(next)
  }
  const saveRelatedRecipes = async (nextRelatedRecipes: RecipeOut[], closePicker = false) => {
    setPendingRelatedRecipes(nextRelatedRecipes)
    try {
      const related = await api.setRelatedRecipes(recipeId, nextRelatedRecipes.map((recipe) => recipe.id))
      queryClient.setQueryData(relatedQueryKey, related)
      setPendingRelatedRecipes(related)
      if (closePicker) setPickerOpen(false)
      void refetch()
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch {
      setPendingRelatedRecipes(null)
      void queryClient.invalidateQueries({ queryKey: relatedQueryKey })
      if (closePicker) setPickerOpen(true)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      Alert.alert(t('common.ok'), t('addRecipe.saveError'))
    }
  }
  const done = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    void saveRelatedRecipes(candidates.filter((recipe) => selectedRef.current.has(recipe.id)), true)
  }
  const removeRelatedRecipe = (id: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    void saveRelatedRecipes(displayedRelatedRecipes.filter((recipe) => recipe.id !== id))
  }
  const candidates = recipes.filter((recipe) => recipe.id !== recipeId)
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{t('relatedRecipes.title')}</Text>
      <MarqueeSyncProvider>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.relatedRecipesRow}>
          {displayedRelatedRecipes.map((recipe) => (
            <RelatedRecipeCard
              key={recipe.id}
              recipe={recipe}
              actions={relatedRecipeActions}
              onPress={() => router.push(`/recipe/${recipe.id}`)}
              onRemove={() => removeRelatedRecipe(recipe.id)}
            />
          ))}
          <Pressable style={styles.relatedRecipeAdd} onPress={openPicker} accessibilityLabel={t('common.edit')}><Feather name="edit-2" size={16} color="#007aff" /><Text style={styles.relatedRecipeAddText}>{t('common.edit')}</Text></Pressable>
        </ScrollView>
      </MarqueeSyncProvider>
      <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={[styles.relatedPicker, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
          <Text style={styles.relatedPickerTitle}>{t('relatedRecipes.add')}</Text>
          <ScrollView>{candidates.map((recipe) => <Pressable key={recipe.id} style={styles.relatedPickerRow} onPress={() => toggle(recipe.id)}><Text style={styles.relatedPickerRowTitle}>{recipe.title}</Text><Feather name={selected.has(recipe.id) ? 'check-circle' : 'circle'} size={22} color="#007aff" /></Pressable>)}</ScrollView>
          <Pressable style={styles.relatedPickerDone} onPress={done}><Text style={styles.relatedPickerDoneText}>{t('common.done')}</Text></Pressable>
        </View>
      </Modal>
    </View>
  )
}

export default RelatedRecipesSection
