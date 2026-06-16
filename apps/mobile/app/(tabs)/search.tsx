import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  PlatformColor,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import type { ListRenderItemInfo } from 'react-native'
import { useNavigation, useRouter, useFocusEffect } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useRecipes } from '@platekeeper/shared/hooks/useRecipes'
import type { RecipeOut } from '@platekeeper/shared/types'
import { tTag } from '@platekeeper/shared/utils/tagUtils'
import { proxyThumbnailUrl } from '../../src/api/thumbnailUrl'
import { colors } from '../../src/theme/colors'

export default function SearchTab() {
  const navigation = useNavigation()
  const router = useRouter()
  const { t } = useTranslation()
  const { recipes, isLoading } = useRecipes()
  const [query, setQuery] = useState('')
  const inputRef = useRef<TextInput>(null)

  useLayoutEffect(() => {
    navigation.setOptions({ title: t('nav.search') })
  }, [navigation, t])

  useFocusEffect(
    useCallback(() => {
      setQuery('')
      const id = setTimeout(() => inputRef.current?.focus(), 150)
      return () => clearTimeout(id)
    }, []),
  )

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
    <View style={styles.container}>
      <View style={styles.searchBarWrap}>
        <TextInput
          ref={inputRef}
          style={styles.searchInput}
          placeholder={t('recipes.searchPlaceholder')}
          placeholderTextColor={PlatformColor('placeholderText') as unknown as string}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
          accessibilityLabel={t('recipes.searchPlaceholder')}
        />
      </View>

      {isLoading ? (
        <ActivityIndicator style={styles.spinner} />
      ) : query.trim() === '' ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>{t('recipes.searchPlaceholder')}</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>{t('recipes.noResults')}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PlatformColor('systemBackground') as unknown as string },
  searchBarWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  searchInput: {
    height: 44,
    backgroundColor: PlatformColor('secondarySystemBackground') as unknown as string,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    color: PlatformColor('label') as unknown as string,
  },
  spinner: { marginTop: 40 },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
  },
  emptyText: {
    fontSize: 16,
    color: PlatformColor('secondaryLabel') as unknown as string,
  },
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
    color: PlatformColor('label') as unknown as string,
    fontWeight: '500',
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
})
