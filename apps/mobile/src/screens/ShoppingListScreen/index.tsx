import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as KeepAwake from 'expo-keep-awake'
import {
  ActionSheetIOS,
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { Feather } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearTransition, useReducedMotion } from 'react-native-reanimated'
import { useIsFocused } from 'expo-router'
import DraggableFlatList, { ScaleDecorator, type RenderItemParams } from 'react-native-draggable-flatlist'
import { Swipeable } from 'react-native-gesture-handler'
import { useShoppingList } from '@carrot/shared/hooks/useShoppingList'
import { usePreferences } from '@carrot/shared/hooks/usePreferences'
import type { PresenceUser, ShoppingCategory, ShoppingListItem } from '@carrot/shared/types'
import { colors } from '../../theme/colors'
import { useScreenLoading } from '../../hooks/useScreenLoading'
import { useIsAppActive } from '../../hooks/useIsAppActive'
import { useHousehold } from '../../context/HouseholdContext'
import { styles } from './styles'
import CheckCircle from './CheckCircle'
import PresenceBar from './PresenceBar'
import AddItemRow from './AddItemRow'
import ShoppingCategorySection from './ShoppingCategorySection'
import { sectionStyles } from './sectionStyles'
import { KEEP_AWAKE_SHOPPING_STORAGE_KEY } from '../SettingsScreen/helpers'
import {
  buildShoppingListRows,
  categoryOrdersFromRows,
  type ShoppingListRow,
  visibleShoppingCategories,
} from './helpers'

const KEEP_AWAKE_SHOPPING_TAG = 'shopping-list'
const COMPLETED_GRACE_MS = 10_000

const ShoppingListScreen = () => {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const isFocused = useIsFocused()
  const isAppActive = useIsAppActive()
  const { activeHouseholdId } = useHousehold()
  const { preferences } = usePreferences()
  const reduceMotion = useReducedMotion()
  const [keepScreenOn, setKeepScreenOn] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [collapsedCategories, setCollapsedCategories] = useState<Partial<Record<ShoppingCategory, boolean>>>({})
  const [recentCompletedIds, setRecentCompletedIds] = useState<Set<string>>(new Set())
  const completedTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const collapseStorageKey = activeHouseholdId
    ? `shopping-list-collapsed-categories:${activeHouseholdId}`
    : null

  const {
    items,
    incompleteItems,
    completedItems,
    isLoading,
    presence,
    setEditing,
    addItems,
    toggle,
    editText,
    reorder,
    remove,
    clearCompleted,
  } = useShoppingList()
  const { busy, showSpinner } = useScreenLoading(isLoading)
  const categories = useMemo(
    () => visibleShoppingCategories(preferences?.shopping_categories),
    [preferences?.shopping_categories]
  )
  const rows = useMemo(
    () => buildShoppingListRows({
      items,
      categories,
      collapsedCategories,
      showCompleted: preferences?.show_completed_shopping_items ?? false,
      recentCompletedIds,
    }),
    [items, categories, collapsedCategories, preferences?.show_completed_shopping_items, recentCompletedIds]
  )

  useEffect(() => {
    if (!isFocused) {
      setKeepScreenOn(false)
      return
    }
    void AsyncStorage.getItem(KEEP_AWAKE_SHOPPING_STORAGE_KEY).then((value) => {
      setKeepScreenOn(value === '1')
    })
  }, [isFocused])

  useEffect(() => {
    if (!collapseStorageKey) {
      setCollapsedCategories({})
      return
    }
    void AsyncStorage.getItem(collapseStorageKey).then((value) => {
      setCollapsedCategories(value ? JSON.parse(value) : {})
    })
  }, [collapseStorageKey])

  useEffect(() => {
    if (isAppActive && isFocused && keepScreenOn) {
      void KeepAwake.activateKeepAwakeAsync(KEEP_AWAKE_SHOPPING_TAG)
    } else {
      KeepAwake.deactivateKeepAwake(KEEP_AWAKE_SHOPPING_TAG)
    }
    return () => {
      KeepAwake.deactivateKeepAwake(KEEP_AWAKE_SHOPPING_TAG)
    }
  }, [isAppActive, isFocused, keepScreenOn])

  useEffect(() => () => {
    Object.values(completedTimersRef.current).forEach(clearTimeout)
  }, [])

  const toggleCategory = useCallback((category: ShoppingCategory) => {
    setCollapsedCategories((current) => {
      const next = { ...current, [category]: !current[category] }
      if (collapseStorageKey) void AsyncStorage.setItem(collapseStorageKey, JSON.stringify(next))
      return next
    })
  }, [collapseStorageKey])

  const lockedByOther = useCallback(
    (itemId: string): PresenceUser | undefined => presence.find((user) => user.item_id === itemId),
    [presence]
  )

  const handleClearCompleted = useCallback(() => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [t('shoppingList.clearCompleted'), t('common.cancel')],
        destructiveButtonIndex: 0,
        cancelButtonIndex: 1,
      },
      (index) => {
        if (index === 0) {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
          clearCompleted.mutate()
        }
      }
    )
  }, [clearCompleted, t])

  const handleAdd = useCallback((text: string, category: ShoppingCategory) => {
    addItems.mutate([{ text, category }])
  }, [addItems])

  const handleToggle = useCallback((item: ShoppingListItem) => {
    toggle.mutate({ id: item.id, completed: item.completed })
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)

    if (item.completed) {
      clearTimeout(completedTimersRef.current[item.id])
      delete completedTimersRef.current[item.id]
      setRecentCompletedIds((current) => {
        const next = new Set(current)
        next.delete(item.id)
        return next
      })
      return
    }

    setRecentCompletedIds((current) => new Set(current).add(item.id))
    completedTimersRef.current[item.id] = setTimeout(() => {
      setRecentCompletedIds((current) => {
        const next = new Set(current)
        next.delete(item.id)
        return next
      })
      delete completedTimersRef.current[item.id]
    }, COMPLETED_GRACE_MS)
  }, [toggle])

  const handleEditStart = useCallback((item: ShoppingListItem) => {
    setEditingId(item.id)
    setEditingText(item.text)
    setEditing(item.id)
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid)
  }, [setEditing])

  const handleEditSubmit = useCallback((item: ShoppingListItem) => {
    const text = editingText.trim()
    if (text && text !== item.text) {
      editText.mutate({ id: item.id, text })
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    }
    setEditingId(null)
    setEditingText('')
    setEditing(null)
  }, [editingText, editText, setEditing])

  const renderRightDelete = useCallback((itemId: string, locked: boolean) => () =>
    locked ? null : (
      <Pressable
        style={styles.deleteAction}
        onPress={() => {
          remove.mutate(itemId)
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        }}
        accessibilityLabel={t('common.delete')}
      >
        <Feather name="trash-2" size={18} color="#fff" />
      </Pressable>
    ), [remove, t])

  const renderItem = useCallback(({ item, drag, isActive }: RenderItemParams<ShoppingListRow>) => {
    if (item.kind === 'section') {
      return (
        <ShoppingCategorySection
          category={item.category}
          activeCount={item.activeCount}
          collapsed={item.collapsed}
          onToggle={() => toggleCategory(item.category)}
        />
      )
    }

    if (item.kind === 'add') {
      return (
        <AddItemRow
          onAdd={(text) => handleAdd(text, item.category)}
          onFocusInput={() => {}}
          onBlurInput={() => {}}
        />
      )
    }

    const shoppingItem = item.item
    const isCompleted = item.kind === 'completed'
    const isEditing = editingId === shoppingItem.id
    const editor = lockedByOther(shoppingItem.id)
    const isLocked = !!editor && !isEditing
    return (
      <ScaleDecorator>
        <Swipeable renderRightActions={renderRightDelete(shoppingItem.id, isLocked)} overshootRight={false}>
          <View style={[styles.item, isActive && !isCompleted && styles.itemActive]}>
            <CheckCircle
              checked={isCompleted}
              onPress={() => handleToggle(shoppingItem)}
              accessibilityLabel={shoppingItem.text}
            />
            <View style={styles.textArea}>
              {isEditing ? (
                <TextInput
                  style={styles.editInput}
                  value={editingText}
                  onChangeText={setEditingText}
                  onSubmitEditing={() => handleEditSubmit(shoppingItem)}
                  onBlur={() => handleEditSubmit(shoppingItem)}
                  returnKeyType="done"
                  autoFocus
                  autoCapitalize="sentences"
                  autoCorrect
                />
              ) : (
                <Pressable
                  onPress={() => !isLocked && handleEditStart(shoppingItem)}
                  disabled={isLocked}
                  accessibilityLabel={isLocked
                    ? t('shoppingList.presenceEditing', { name: editor!.nickname })
                    : shoppingItem.text}
                >
                  <Text style={[styles.itemText, isCompleted && styles.completedText]}>{shoppingItem.text}</Text>
                  {isLocked ? (
                    <View style={styles.lockBadge}>
                      <View style={[styles.lockDot, { backgroundColor: editor.color }]} />
                      <Text style={styles.lockText}>{t('shoppingList.presenceEditing', { name: editor.nickname })}</Text>
                    </View>
                  ) : null}
                </Pressable>
              )}
            </View>
            {!isCompleted && (isLocked ? (
              <View style={styles.dragHandle}>
                <Feather name="lock" size={14} color={colors.gray3} />
              </View>
            ) : (
              <Pressable
                onLongPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
                  drag()
                }}
                disabled={isActive}
                hitSlop={8}
                style={styles.dragHandle}
                accessibilityLabel={t('recipes.dragToReorder')}
              >
                <Feather name="menu" size={18} color={colors.tertiaryLabel} />
              </Pressable>
            ))}
          </View>
        </Swipeable>
      </ScaleDecorator>
    )
  }, [
    editingId,
    editingText,
    handleAdd,
    handleEditStart,
    handleEditSubmit,
    handleToggle,
    lockedByOther,
    renderRightDelete,
    t,
    toggleCategory,
  ])

  const handleDragEnd = useCallback(({ data }: { data: ShoppingListRow[] }) => {
    const categoryOrders = categoryOrdersFromRows(data)
    for (const item of incompleteItems) {
      const included = Object.values(categoryOrders).some((ids) => ids?.includes(item.id))
      if (!included) {
        const order = categoryOrders[item.category] ?? []
        order.push(item.id)
        categoryOrders[item.category] = order
      }
    }
    reorder.mutate(categoryOrders)
  }, [incompleteItems, reorder])

  if (busy) {
    return <View style={styles.center}>{showSpinner ? <ActivityIndicator size="large" /> : null}</View>
  }

  return (
    <View style={styles.screen}>
      <DraggableFlatList
        data={rows}
        keyExtractor={(item) => item.kind === 'section' || item.kind === 'add'
          ? `${item.kind}-${item.category}`
          : `${item.kind}-${item.item.id}`}
        renderItem={renderItem}
        onDragEnd={handleDragEnd}
        containerStyle={styles.listContainer}
        itemLayoutAnimation={reduceMotion ? undefined : LinearTransition.duration(220)}
        ListHeaderComponent={
          <View>
            <PresenceBar users={presence} />
            {completedItems.length > 0 ? (
              <Pressable
                style={sectionStyles.clearCompleted}
                onPress={handleClearCompleted}
                accessibilityLabel={t('shoppingList.clearCompleted')}
              >
                <Text style={styles.clearBtn}>{t('shoppingList.clearCompleted')}</Text>
              </Pressable>
            ) : null}
          </View>
        }
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ paddingTop: insets.top + 56, paddingBottom: insets.bottom + 64 }}
      />
    </View>
  )
}


export default ShoppingListScreen
