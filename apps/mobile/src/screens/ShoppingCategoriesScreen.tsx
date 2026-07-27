import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PlatformColor, Switch, Text, View, StyleSheet } from 'react-native'
import DraggableFlatList, { ScaleDecorator, type RenderItemParams } from 'react-native-draggable-flatlist'
import { Feather } from '@expo/vector-icons'
import { Stack } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  DEFAULT_SHOPPING_CATEGORIES,
  SHOPPING_CATEGORIES,
  type ShoppingCategory,
} from '@carrot/shared/types'
import { usePreferences } from '@carrot/shared/hooks/usePreferences'

const ShoppingCategoriesScreen = () => {
  const { t } = useTranslation()
  const { preferences, update } = usePreferences()
  const [categories, setCategories] = useState<ShoppingCategory[]>(DEFAULT_SHOPPING_CATEGORIES)
  const confirmedCategoriesRef = useRef<ShoppingCategory[]>(DEFAULT_SHOPPING_CATEGORIES)
  const writeQueueRef = useRef(Promise.resolve())

  useEffect(() => {
    if (!preferences) return
    setCategories(preferences.shopping_categories)
    confirmedCategoriesRef.current = preferences.shopping_categories
  }, [preferences])

  const saveCategories = useCallback((nextCategories: ShoppingCategory[]) => {
    writeQueueRef.current = writeQueueRef.current
      .then(async () => {
        const updated = await update.mutateAsync({ shopping_categories: nextCategories })
        confirmedCategoriesRef.current = updated.shopping_categories
      })
      .catch(() => {
        setCategories(confirmedCategoriesRef.current)
      })
  }, [update])

  const handleToggle = useCallback((category: ShoppingCategory, enabled: boolean) => {
    if (category === 'other') return

    setCategories((current) => {
      const nextCategories = enabled
        ? SHOPPING_CATEGORIES.filter((candidate) => candidate === category || current.includes(candidate))
        : current.filter((candidate) => candidate !== category)
      saveCategories(nextCategories)
      return nextCategories
    })
  }, [saveCategories])

  const displayedCategories = useMemo(
    () => [
      ...categories,
      ...SHOPPING_CATEGORIES.filter((category) => !categories.includes(category)),
    ],
    [categories]
  )

  const renderItem = useCallback(({ item, drag, isActive }: RenderItemParams<ShoppingCategory>) => {
    const enabled = categories.includes(item)
    const locked = item === 'other'

    return (
      <ScaleDecorator>
        <View style={[styles.row, isActive && styles.activeRow]}>
          <Switch
            value={enabled || locked}
            disabled={locked}
            onValueChange={(value) => handleToggle(item, value)}
            accessibilityLabel={t(`shoppingList.categories.${item}`)}
          />
          <Text style={styles.label}>{t(`shoppingList.categories.${item}`)}</Text>
          <Feather
            name={locked ? 'lock' : 'menu'}

            size={20}
            color={PlatformColor('tertiaryLabel') as unknown as string}
            onLongPress={locked ? undefined : drag}
            accessibilityLabel={locked ? t('settings.shoppingCategoryRequired') : t('recipes.dragToReorder')}
          />
        </View>
      </ScaleDecorator>
    )
  }, [categories, handleToggle, t])

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: t('settings.shoppingCategories'), headerLargeTitle: true }} />
      <Text style={styles.description}>{t('settings.shoppingCategoriesDesc')}</Text>
      <DraggableFlatList
        data={displayedCategories}
        keyExtractor={(item) => item}
        renderItem={renderItem}
        onDragEnd={({ data }) => {
          const nextCategories = data.filter((category): category is ShoppingCategory =>
            categories.includes(category)
          )
          if (!nextCategories.includes('other')) nextCategories.push('other')
          setCategories(nextCategories)
          saveCategories(nextCategories)
        }}
        contentContainerStyle={styles.list}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PlatformColor('systemGroupedBackground') as unknown as string },
  description: { color: PlatformColor('secondaryLabel') as unknown as string, fontSize: 16, lineHeight: 21, margin: 16 },
  list: { backgroundColor: PlatformColor('secondarySystemGroupedBackground') as unknown as string, marginHorizontal: 16, borderRadius: 10 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 52, paddingHorizontal: 16 },
  activeRow: { backgroundColor: PlatformColor('tertiarySystemFill') as unknown as string },
  label: { color: PlatformColor('label') as unknown as string, flex: 1, fontSize: 16, lineHeight: 21 },
})

export default ShoppingCategoriesScreen
