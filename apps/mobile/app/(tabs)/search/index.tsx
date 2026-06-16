import { useCallback, useMemo, useState } from 'react'
import {
  FlatList,
  Image,
  PlatformColor,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import type { ListRenderItemInfo } from 'react-native'
import { Stack, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useRecipes } from '@platekeeper/shared/hooks/useRecipes'
import type { RecipeOut } from '@platekeeper/shared/types'
import { tTag } from '@platekeeper/shared/utils/tagUtils'
import { proxyThumbnailUrl } from '../../../src/api/thumbnailUrl'

export default function SearchIndex() {
  const router = useRouter()
  const { t } = useTranslation()
  const { recipes } = useRecipes()
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return recipes.filter((r) => r.title.toLowerCase().includes(q))
  }, [recipes, query])

  const handlePress = useCallback(
    (recipe: RecipeOut) => {
      router.push({ pathname: '/recipe/[id]', params: { id: recipe.id, title: recipe.title } })
    },
    [router],
  )

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<RecipeOut>) => (
      <Pressable
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
        onPress={() => handlePress(item)}
        accessibilityLabel={item.title}
        accessibilityRole="button"
      >
        {item.thumbnail_url ? (
          <Image
            source={{ uri: proxyThumbnailUrl(item.thumbnail_url)! }}
            style={styles.cardImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.cardImagePlaceholder} />
        )}
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
          {item.tags.length > 0 && (
            <Text style={styles.cardTags} numberOfLines={1}>
              {item.tags.map((tg) => tTag(tg.name, t)).join(', ')}
            </Text>
          )}
        </View>
      </Pressable>
    ),
    [handlePress, t],
  )

  return (
    <>
      <Stack.Title>{t('nav.search')}</Stack.Title>
      <Stack.SearchBar
        placement="automatic"
        placeholder={t('recipes.searchPlaceholder')}
        onChangeText={setQuery}
      />
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          query.trim() ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>{t('recipes.noResults')}</Text>
            </View>
          ) : null
        }
      />
    </>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: PlatformColor('systemBackground') as unknown as string,
    gap: 12,
  },
  cardImage: { width: 52, height: 52, borderRadius: 8 },
  cardImagePlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: PlatformColor('secondarySystemBackground') as unknown as string,
  },
  cardBody: { flex: 1 },
  cardTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: PlatformColor('label') as unknown as string,
  },
  cardTags: {
    fontSize: 13,
    color: PlatformColor('secondaryLabel') as unknown as string,
    marginTop: 2,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: PlatformColor('separator') as unknown as string,
    marginLeft: 80,
  },
  emptyState: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: PlatformColor('secondaryLabel') as unknown as string,
  },
})
