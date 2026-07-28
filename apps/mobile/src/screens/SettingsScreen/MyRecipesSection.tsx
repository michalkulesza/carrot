import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { useApiClient } from '@carrot/shared/api/context'
import { useMyRecipes } from '@carrot/shared/hooks/useRecipes'
import type { HouseholdOut, RecipeOut } from '@carrot/shared/types'
import Avatar from '../../components/Avatar'
import { colors } from '../../theme/colors'

interface MyRecipeRowProps {
  recipe: RecipeOut
  households: HouseholdOut[]
  activeHouseholdId: string | null
  onDeleted: (id: string) => void
}

const MyRecipeRow = ({ recipe, households, activeHouseholdId, onDeleted }: MyRecipeRowProps) => {
  const { t } = useTranslation()
  const router = useRouter()
  const api = useApiClient()
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const linkedToActiveHousehold =
    !!activeHouseholdId && recipe.household_ids.includes(activeHouseholdId)
  const activeHousehold = households.find((h) => h.id === activeHouseholdId)

  const handleView = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    router.push({ pathname: '/recipe/[id]', params: { id: recipe.id, title: recipe.title } })
  }, [router, recipe.id, recipe.title])

  const handleRemoveFromHousehold = useCallback(async () => {
    if (!activeHouseholdId) return
    setBusy(true)
    try {
      await api.removeRecipeFromHousehold(recipe.id, activeHouseholdId)
      await qc.invalidateQueries({ queryKey: ['recipes', 'mine'] })
      onDeleted(recipe.id)
    } catch (e) {
      Alert.alert(t('common.ok'), e instanceof Error ? e.message : t('recipes.failedToDelete'))
      setBusy(false)
    }
  }, [api, qc, recipe.id, activeHouseholdId, onDeleted, t])

  const handleDeleteEverywhere = useCallback(async () => {
    setBusy(true)
    try {
      await api.deleteRecipe(recipe.id)
      await qc.invalidateQueries({ queryKey: ['recipes', 'mine'] })
      onDeleted(recipe.id)
    } catch (e) {
      Alert.alert(t('common.ok'), e instanceof Error ? e.message : t('recipes.failedToDelete'))
      setBusy(false)
    }
  }, [api, qc, recipe.id, onDeleted, t])

  const handleDelete = useCallback(() => {
    const buttons: Parameters<typeof Alert.alert>[2] = [{ text: t('common.cancel'), style: 'cancel' }]
    if (linkedToActiveHousehold && activeHousehold) {
      buttons.push({
        text: t('recipes.deleteFromHousehold', { name: activeHousehold.name }),
        style: 'destructive',
        onPress: () => void handleRemoveFromHousehold(),
      })
    }
    buttons.push({
      text: t('recipes.deleteEverywhere'),
      style: 'destructive',
      onPress: () => void handleDeleteEverywhere(),
    })
    Alert.alert(t('recipes.deleteTitle'), t('recipes.deleteConfirm', { title: recipe.title }), buttons)
  }, [t, recipe.title, linkedToActiveHousehold, activeHousehold, handleRemoveFromHousehold, handleDeleteEverywhere])

  return (
    <Pressable
      style={({ pressed }) => [rowStyles.row, pressed && { opacity: 0.7 }]}
      onPress={handleView}
      onLongPress={busy ? undefined : handleDelete}
      accessibilityLabel={recipe.title}
      accessibilityRole="button"
    >
      <Avatar name={recipe.title} size={32} />
      <View style={rowStyles.info}>
        <Text style={rowStyles.title} numberOfLines={1}>{recipe.title}</Text>
        <View style={rowStyles.badgeRow}>
          {recipe.household_ids
            .map((id) => households.find((h) => h.id === id))
            .filter((h): h is HouseholdOut => !!h)
            .map((h) => (
              <View key={h.id} style={[rowStyles.badgeDot, { backgroundColor: h.color }]} />
            ))}
        </View>
      </View>
      {busy && <ActivityIndicator size="small" />}
    </Pressable>
  )
}

const RowSeparator = () => <View style={rowStyles.rowBorder} />

const keyExtractor = (recipe: RecipeOut) => recipe.id

const MyRecipesSection = ({
  households,
  activeHouseholdId,
}: {
  households: HouseholdOut[]
  activeHouseholdId: string | null
}) => {
  const { data: myRecipes = [], isLoading, isError } = useMyRecipes()
  const { t } = useTranslation()
  const qc = useQueryClient()

  const handleDeleted = useCallback(
    (id: string) => {
      qc.setQueryData<RecipeOut[]>(['recipes', 'mine'], (old = []) => old.filter((r) => r.id !== id))
    },
    [qc],
  )

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<RecipeOut>) => (
      <MyRecipeRow
        recipe={item}
        households={households}
        activeHouseholdId={activeHouseholdId}
        onDeleted={handleDeleted}
      />
    ),
    [households, activeHouseholdId, handleDeleted],
  )

  if (isLoading) {
    return (
      <View style={rowStyles.centered}>
        <ActivityIndicator accessibilityLabel={t('common.loading')} />
      </View>
    )
  }

  if (isError) return null

  if (myRecipes.length === 0) {
    return (
      <View style={[rowStyles.centered, rowStyles.emptyState]}>
        <Text style={rowStyles.empty}>{t('settings.myRecipesEmpty')}</Text>
      </View>
    )
  }

  return (
    <FlatList
      data={myRecipes}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      ItemSeparatorComponent={RowSeparator}
      style={rowStyles.list}
      contentContainerStyle={rowStyles.card}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    />
  )
}

const rowStyles = StyleSheet.create({
  list: { flex: 1 },
  // Margins keep the card inset while the scroll view itself stays full-bleed, so
  // rows pass under the transparent header and the tab bar.
  card: {
    backgroundColor: colors.background,
    borderRadius: 10,
    overflow: 'hidden',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 32,
  },
  rowBorder: { height: StyleSheet.hairlineWidth, backgroundColor: colors.secondaryBackground },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  info: { flex: 1, minWidth: 0 },
  title: { fontSize: 16, color: colors.label },
  badgeRow: { flexDirection: 'row', gap: 4, marginTop: 4 },
  badgeDot: { width: 8, height: 8, borderRadius: 4 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyState: { paddingHorizontal: 32 },
  empty: {
    fontSize: 16,
    lineHeight: 22,
    color: colors.tertiaryLabel,
    textAlign: 'center',
  },
})

export default MyRecipesSection
