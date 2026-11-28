import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type AccessibilityActionEvent, Pressable, StyleSheet, View } from 'react-native'
import DraggableFlatList, { ScaleDecorator, type RenderItemParams } from 'react-native-draggable-flatlist'
import { SymbolView } from 'expo-symbols'
import { Stack } from 'expo-router'
import { useHeaderHeight } from 'expo-router/react-navigation'
import { useTranslation } from 'react-i18next'
import {
  DEFAULT_SHOPPING_CATEGORIES,
  SHOPPING_CATEGORIES,
  type ShoppingCategory,
} from '@carrot/shared/types'
import { usePreferences } from '@carrot/shared/hooks/usePreferences'
import { AppText, SettingsRow } from '../components/ui'
import { lightHaptic, mediumHaptic } from '../components/ui/haptics'
import { useEdgeEffectHeader } from '../hooks/useEdgeEffectHeader'
import { useInsetContentStyle } from '../hooks/useInsetContentStyle'
import { palette, radius, screenGutter, space } from '../theme'

const MOVE_UP_ACTION = 'moveUp'
const MOVE_DOWN_ACTION = 'moveDown'
const HANDLE_ICON_SIZE = 20
const HANDLE_DELAY_MS = 120
const HANDLE_HIT_SLOP = 12

const toDisplayOrder = (categories: ShoppingCategory[]) => [
  ...categories.filter((category) => category !== 'other'),
  ...SHOPPING_CATEGORIES.filter((category) => category !== 'other' && !categories.includes(category)),
  'other' as const,
]

const keyExtractor = (item: ShoppingCategory) => item

const Separator = () => <View style={styles.separator} />

interface CategoryRowProps {
  category: ShoppingCategory
  enabled: boolean
  position: number
  total: number
  isActive: boolean
  drag: () => void
  onToggle: (category: ShoppingCategory, enabled: boolean) => void
  onMove: (category: ShoppingCategory, delta: number) => void
}

const CategoryRow = memo(({ category, enabled, position, total, isActive, drag, onToggle, onMove }: CategoryRowProps) => {
  const { t } = useTranslation()
  const locked = category === 'other'
  const title = t(`shoppingList.categories.${category}`)

  const handleSwitchChange = useCallback((value: boolean) => onToggle(category, value), [onToggle, category])
  const handleDrag = useCallback(() => {
    mediumHaptic()
    drag()
  }, [drag])

  const reorderable = enabled && !locked
  const accessibilityActions = useMemo(
    () =>
      reorderable
        ? [
            ...(position > 1 ? [{ name: MOVE_UP_ACTION, label: t('settings.moveUp') }] : []),
            ...(position < total ? [{ name: MOVE_DOWN_ACTION, label: t('settings.moveDown') }] : []),
          ]
        : undefined,
    [reorderable, position, total, t],
  )

  const handleAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === MOVE_UP_ACTION) onMove(category, -1)
      if (event.nativeEvent.actionName === MOVE_DOWN_ACTION) onMove(category, 1)
    },
    [onMove, category],
  )

  const accessibilityHint = useMemo(() => {
    if (locked) return `${t('settings.shoppingCategoryOtherDesc')}. ${t('settings.shoppingCategoryRequired')}`
    if (reorderable) return t('settings.categoryPosition', { position, total })

    return undefined
  }, [locked, reorderable, position, total, t])

  const handle = locked ? (
    <SymbolView name="lock" size={HANDLE_ICON_SIZE} tintColor={palette.placeholder} />
  ) : (
    <Pressable
      onLongPress={handleDrag}
      delayLongPress={HANDLE_DELAY_MS}
      hitSlop={HANDLE_HIT_SLOP}
    >
      <SymbolView name="line.3.horizontal" size={HANDLE_ICON_SIZE} tintColor={palette.placeholder} />
    </Pressable>
  )

  return (
    <ScaleDecorator>
      <View style={[styles.row, isActive && styles.activeRow]}>
        <SettingsRow
          leading={handle}
          title={title}
          subtitle={locked ? t('settings.shoppingCategoryOtherDesc') : undefined}
          accessory={locked ? 'none' : 'switch'}
          switchValue={enabled}
          onSwitchChange={handleSwitchChange}
          accessibilityHint={accessibilityHint}
          accessibilityActions={accessibilityActions}
          onAccessibilityAction={handleAccessibilityAction}
        />
      </View>
    </ScaleDecorator>
  )
})

const ShoppingCategoriesScreen = () => {
  const { t } = useTranslation()
  const headerHeight = useHeaderHeight()
  const insetStyle = useInsetContentStyle(space.lg)
  const { preferences, update } = usePreferences()
  const [categories, setCategories] = useState<ShoppingCategory[]>(DEFAULT_SHOPPING_CATEGORIES)
  const categoriesRef = useRef<ShoppingCategory[]>(DEFAULT_SHOPPING_CATEGORIES)
  const confirmedCategoriesRef = useRef<ShoppingCategory[]>(DEFAULT_SHOPPING_CATEGORIES)
  const writeQueueRef = useRef(Promise.resolve())
  const pendingWriteCountRef = useRef(0)
  const latestActionIdRef = useRef(0)

  useEffect(() => {
    if (!preferences || pendingWriteCountRef.current > 0) return
    categoriesRef.current = preferences.shopping_categories
    setCategories(preferences.shopping_categories)
    confirmedCategoriesRef.current = preferences.shopping_categories
  }, [preferences])

  const applyCategories = useCallback(
    (nextCategories: ShoppingCategory[]) => {
      const actionId = ++latestActionIdRef.current
      categoriesRef.current = nextCategories
      setCategories(nextCategories)
      pendingWriteCountRef.current += 1

      writeQueueRef.current = writeQueueRef.current.then(async () => {
        try {
          const updated = await update.mutateAsync({ shopping_categories: nextCategories })
          confirmedCategoriesRef.current = updated.shopping_categories
        } catch {
          if (actionId === latestActionIdRef.current) {
            categoriesRef.current = confirmedCategoriesRef.current
            setCategories(confirmedCategoriesRef.current)
          }
        } finally {
          pendingWriteCountRef.current -= 1
        }
      })
    },
    [update],
  )

  const handleToggle = useCallback(
    (category: ShoppingCategory, enabled: boolean) => {
      if (category === 'other') return

      const current = categoriesRef.current
      const nextCategories = enabled
        ? [...current.filter((candidate) => candidate !== 'other' && candidate !== category), category, 'other' as const]
        : current.filter((candidate) => candidate !== category)

      applyCategories(nextCategories)
    },
    [applyCategories],
  )

  const handleDragEnd = useCallback(
    ({ data }: { data: ShoppingCategory[] }) => {
      lightHaptic()
      const reordered = data.filter((category) => category !== 'other' && categoriesRef.current.includes(category))

      applyCategories([...reordered, 'other'])
    },
    [applyCategories],
  )

  const handleMove = useCallback(
    (category: ShoppingCategory, delta: number) => {
      const enabled: ShoppingCategory[] = categoriesRef.current.filter((candidate) => candidate !== 'other')
      const index = enabled.indexOf(category)
      const target = index + delta
      if (index === -1 || target < 0 || target >= enabled.length) return

      lightHaptic()
      const reordered = [...enabled]
      reordered.splice(index, 1)
      reordered.splice(target, 0, category)

      applyCategories([...reordered, 'other'])
    },
    [applyCategories],
  )

  const displayedCategories = useMemo(() => toDisplayOrder(categories), [categories])
  const headerOptions = useEdgeEffectHeader(t('settings.shoppingCategories'))
  const screenStyle = useMemo(() => [styles.screen, insetStyle, { paddingTop: headerHeight }], [insetStyle, headerHeight])
  const enabledOrder = useMemo<ShoppingCategory[]>(() => categories.filter((category) => category !== 'other'), [categories])

  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<ShoppingCategory>) => (
      <CategoryRow
        category={item}
        enabled={categories.includes(item)}
        position={enabledOrder.indexOf(item) + 1}
        total={enabledOrder.length}
        isActive={isActive}
        drag={drag}
        onToggle={handleToggle}
        onMove={handleMove}
      />
    ),
    [categories, enabledOrder, handleToggle, handleMove],
  )

  return (
    <View style={screenStyle}>
      <Stack.Screen options={headerOptions} />
      <AppText variant="subtitle" tone="textSecondary" style={styles.intro}>
        {t('settings.shoppingCategoriesIntro')}
      </AppText>
      <DraggableFlatList
        data={displayedCategories}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        onDragEnd={handleDragEnd}
        ItemSeparatorComponent={Separator}
        contentContainerStyle={styles.list}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  intro: { marginHorizontal: screenGutter + space.xs, marginTop: space.xs, marginBottom: space.md + 2 },
  list: {
    backgroundColor: palette.card,
    marginHorizontal: screenGutter,
    borderRadius: radius.card,
    paddingHorizontal: space.lg,
  },
  row: { borderRadius: radius.control },
  activeRow: { backgroundColor: palette.control },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: palette.dividerCard },
})

export default ShoppingCategoriesScreen
