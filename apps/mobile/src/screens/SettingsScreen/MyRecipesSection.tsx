import { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { useApiClient } from '@carrot/shared/api/context'
import { useMyRecipes } from '@carrot/shared/hooks/useRecipes'
import type { HouseholdOut, RecipeOut } from '@carrot/shared/types'
import Avatar from '../../components/Avatar'
import { colors } from '../../theme/colors'
import SectionHeader from './SectionHeader'

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

const MyRecipesSection = ({
  households,
  activeHouseholdId,
}: {
  households: HouseholdOut[]
  activeHouseholdId: string | null
}) => {
  const { t } = useTranslation()
  const { data: myRecipes = [] } = useMyRecipes()
  const qc = useQueryClient()

  const handleDeleted = useCallback(
    (id: string) => {
      qc.setQueryData<RecipeOut[]>(['recipes', 'mine'], (old = []) => old.filter((r) => r.id !== id))
    },
    [qc],
  )

  if (myRecipes.length === 0) return null

  return (
    <>
      <SectionHeader label={t('settings.myRecipes')} />
      <View style={rowStyles.card}>
        {myRecipes.map((recipe: RecipeOut, index: number) => (
          <View
            key={recipe.id}
            style={index < myRecipes.length - 1 ? rowStyles.rowBorder : undefined}
          >
            <MyRecipeRow
              recipe={recipe}
              households={households}
              activeHouseholdId={activeHouseholdId}
              onDeleted={handleDeleted}
            />
          </View>
        ))}
      </View>
    </>
  )
}

const rowStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.background,
    borderRadius: 10,
    marginHorizontal: 16,
    marginTop: 12,
    overflow: 'hidden',
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.secondaryBackground },
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
})

export default MyRecipesSection
