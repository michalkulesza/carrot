import { useCallback, useEffect, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as KeepAwake from 'expo-keep-awake'
import {
  ActionSheetIOS,
  ActivityIndicator,
  Keyboard,
  Pressable,
  TextInput,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { Feather } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useIsFocused } from 'expo-router'
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist'
import { Swipeable } from 'react-native-gesture-handler'
import { useShoppingList } from '@carrot/shared/hooks/useShoppingList'
import type { ShoppingListItem, PresenceUser } from '@carrot/shared/types'
import { colors } from '../../theme/colors'
import { useScreenLoading } from '../../hooks/useScreenLoading'
import { useIsAppActive } from '../../hooks/useIsAppActive'
import { styles } from './styles'
import CheckCircle from './CheckCircle'
import PresenceBar from './PresenceBar'
import ShoppingListFooter from './ShoppingListFooter'
import { KEEP_AWAKE_SHOPPING_STORAGE_KEY } from '../SettingsScreen/helpers'

// Standard iOS tab bar chrome height. The native UITabBar overlays the content,
// and contentInsetAdjustmentBehavior is disabled (DraggableFlatList breaks it),
// so we inset the bottom manually — same as the top nav bar.
const TAB_BAR_HEIGHT = 49
const KEEP_AWAKE_SHOPPING_TAG = 'shopping-list'

const ShoppingListScreen = () => {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const isFocused = useIsFocused()
  const isAppActive = useIsAppActive()
  const [keepScreenOn, setKeepScreenOn] = useState(false)

  useEffect(() => {
    if (!isFocused) {
      setKeepScreenOn(false)
      return
    }

    AsyncStorage.getItem(KEEP_AWAKE_SHOPPING_STORAGE_KEY).then((value) => {
      setKeepScreenOn(value === '1')
    })
  }, [isFocused])

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

  // DraggableFlatList's gesture-handler wrapping breaks the native
  // contentInsetAdjustmentBehavior mechanism — set the inset manually instead.
  const navBarInset = insets.top + 44
  // Extra breathing room so the first row clears the transparent header and the
  // list visibly scrolls underneath it.
  const listTopInset = navBarInset + 12
  // Clear the native tab bar so the last rows aren't hidden underneath it.
  const listBottomInset = insets.bottom + TAB_BAR_HEIGHT

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- DraggableFlatList's ref type doesn't match its actual (gesture-handler) FlatList instance.
  const flatListRef = useRef<any>(null)
  // Total height of the FlatList's scrollable content, from onContentSizeChange.
  const contentHeightRef = useRef(0)
  // Rendered height of the footer (add row + optional completed section +
  // bottom spacer), from its own onLayout. Since the add row is the very
  // first element inside the footer, its absolute top within the scrollable
  // content is always (contentHeight - footerHeight) — both are plain
  // heights, not positions relative to some ambiguous wrapper, so this is
  // exact regardless of how FlatList nests the header/footer internally.
  const footerHeightRef = useRef(0)
  // Whether the add-item input currently has focus — while true, every
  // layout change (e.g. a new item pushing the row down) re-triggers the
  // scroll so the row stays visible.
  const isAddInputFocusedRef = useRef(false)
  // Real keyboard height, added as extra bottom padding to the list's content
  // so there is always genuine scrollable room to bring the add row above the
  // keyboard — rather than relying on the container merely shrinking (which
  // may not actually grow the scrollable range for this animated/gesture-
  // wrapped FlatList in time for an immediate scrollToOffset call).
  const [keyboardHeight, setKeyboardHeight] = useState(0)

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardWillShow', (e) => {
      setKeyboardHeight(e.endCoordinates.height)
    })
    const hideSub = Keyboard.addListener('keyboardWillHide', () => {
      setKeyboardHeight(0)
    })
    return () => {
      showSub.remove()
      hideSub.remove()
    }
  }, [])

  const scrollToAddRow = useCallback(() => {
    const addRowTop = contentHeightRef.current - footerHeightRef.current
    const offset = Math.max(addRowTop - navBarInset, 0)
    flatListRef.current?.scrollToOffset({ offset, animated: true })
  }, [navBarInset])

  const handleContentSizeChange = useCallback(
    (_width: number, height: number) => {
      contentHeightRef.current = height
      if (isAddInputFocusedRef.current) scrollToAddRow()
    },
    [scrollToAddRow]
  )

  const handleFooterLayout = useCallback(
    (event: LayoutChangeEvent) => {
      footerHeightRef.current = event.nativeEvent.layout.height
      if (isAddInputFocusedRef.current) scrollToAddRow()
    },
    [scrollToAddRow]
  )

  const handleFocusInput = useCallback(() => {
    isAddInputFocusedRef.current = true
    // Wait a beat for the extra keyboard-height padding (set via state above)
    // to actually apply to the list's layout before scrolling to it.
    setTimeout(scrollToAddRow, 50)
    setTimeout(scrollToAddRow, 350)
  }, [scrollToAddRow])

  const handleBlurInput = useCallback(() => {
    isAddInputFocusedRef.current = false
  }, [])

  const {
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

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')

  const lockedByOther = useCallback(
    (itemId: string): PresenceUser | undefined =>
      presence.find((u) => u.item_id === itemId),
    [presence]
  )

  const handleClearCompleted = useCallback(() => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [t('shoppingList.clearCompleted'), t('common.cancel')],
        destructiveButtonIndex: 0,
        cancelButtonIndex: 1,
      },
      (idx) => {
        if (idx === 0) {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
          clearCompleted.mutate()
        }
      }
    )
  }, [clearCompleted, t])

  const handleAdd = useCallback(
    (text: string) => {
      addItems.mutate([text])
    },
    [addItems]
  )

  const handleToggle = useCallback(
    (id: string, completed: boolean) => {
      toggle.mutate({ id, completed })
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    },
    [toggle]
  )

  const handleEditStart = useCallback(
    (item: ShoppingListItem) => {
      setEditingId(item.id)
      setEditingText(item.text)
      setEditing(item.id)
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid)
    },
    [setEditing]
  )

  const handleEditSubmit = useCallback(
    (id: string, originalText: string) => {
      const text = editingText.trim()
      if (text && text !== originalText) {
        editText.mutate({ id, text })
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      }
      setEditingId(null)
      setEditingText('')
      setEditing(null)
    },
    [editingText, editText, setEditing]
  )

  const handleDelete = useCallback(
    (id: string) => {
      remove.mutate(id)
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    },
    [remove]
  )

  const renderRightDelete = useCallback(
    (id: string, locked: boolean) => () =>
      locked ? null : (
        <Pressable
          style={styles.deleteAction}
          onPress={() => handleDelete(id)}
          accessibilityLabel={t('common.delete')}
        >
          <Feather name="trash-2" size={18} color="#fff" />
        </Pressable>
      ),
    [handleDelete, t]
  )

  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<ShoppingListItem>) => {
      const isEditing = editingId === item.id
      const editor = lockedByOther(item.id)
      const isLocked = !!editor && !isEditing

      return (
        <ScaleDecorator>
          <Swipeable
            renderRightActions={renderRightDelete(item.id, isLocked)}
            overshootRight={false}
          >
            <View style={[styles.item, isActive && styles.itemActive]}>
              <CheckCircle
                checked={false}
                onPress={() => handleToggle(item.id, item.completed)}
                accessibilityLabel={item.text}
              />

              <View style={styles.textArea}>
                {isEditing ? (
                  <TextInput
                    style={styles.editInput}
                    value={editingText}
                    onChangeText={setEditingText}
                    onSubmitEditing={() => handleEditSubmit(item.id, item.text)}
                    onBlur={() => handleEditSubmit(item.id, item.text)}
                    returnKeyType="done"
                    autoFocus
                    autoCapitalize="sentences"
                    autoCorrect
                  />
                ) : (
                  <Pressable
                    onPress={() => !isLocked && handleEditStart(item)}
                    disabled={isLocked}
                    accessibilityLabel={
                      isLocked
                        ? t('shoppingList.presenceEditing', { name: editor!.nickname })
                        : item.text
                    }
                  >
                    <Text style={styles.itemText}>{item.text}</Text>
                    {isLocked && (
                      <View style={styles.lockBadge}>
                        <View style={[styles.lockDot, { backgroundColor: editor!.color }]} />
                        <Text style={styles.lockText}>
                          {t('shoppingList.presenceEditing', { name: editor!.nickname })}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                )}
              </View>

              {isLocked ? (
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
              )}
            </View>
          </Swipeable>
        </ScaleDecorator>
      )
    },
    [editingId, editingText, lockedByOther, handleToggle, handleEditStart, handleEditSubmit, renderRightDelete, t]
  )

  if (busy) {
    // Defer to the root loadingOverlay while auth is bootstrapping.
    return (
      <View style={styles.center}>
        {showSpinner && <ActivityIndicator size="large" />}
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <DraggableFlatList
        ref={flatListRef}
        data={incompleteItems}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        onDragEnd={({ data }) => reorder.mutate(data.map((i) => i.id))}
        containerStyle={styles.listContainer}
        ListHeaderComponent={<PresenceBar users={presence} />}
        ListFooterComponent={
          <ShoppingListFooter
            completedItems={completedItems}
            onAdd={handleAdd}
            onFocusInput={handleFocusInput}
            onBlurInput={handleBlurInput}
            onToggle={handleToggle}
            onClearCompleted={handleClearCompleted}
            renderRightDelete={renderRightDelete}
            bottomInset={listBottomInset}
            onFooterLayout={handleFooterLayout}
          />
        }
        contentInsetAdjustmentBehavior="never"
        scrollIndicatorInsets={{ top: navBarInset, bottom: listBottomInset }}
        contentContainerStyle={[styles.listContent, { paddingTop: listTopInset, paddingBottom: keyboardHeight }]}
        onContentSizeChange={handleContentSizeChange}
      />
    </View>
  )
}

export default ShoppingListScreen
