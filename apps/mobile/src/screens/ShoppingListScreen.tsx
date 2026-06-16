import { useCallback, useRef, useState } from 'react'
import {
  ActionSheetIOS,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { Feather } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist'
import { Swipeable } from 'react-native-gesture-handler'
import { useShoppingList } from '@platekeeper/shared/hooks/useShoppingList'
import type { ShoppingListItem, PresenceUser } from '@platekeeper/shared/types'
import { colors } from '../theme/colors'

// ── Presence chip (colored initial dot + name) ────────────────────────────────

const PresenceChip = ({ user }: { user: PresenceUser }) => (
  <View style={[styles.presenceChip, { backgroundColor: user.color }]}>
    <Text style={styles.presenceInitial}>{user.nickname.charAt(0).toUpperCase()}</Text>
  </View>
)

const PresenceBar = ({ users, currentUserId }: { users: PresenceUser[]; currentUserId?: string }) => {
  const others = users.filter((u) => u.user_id !== currentUserId)
  if (others.length === 0) return null
  return (
    <View style={styles.presenceBar}>
      {others.map((u) => (
        <PresenceChip key={u.user_id} user={u} />
      ))}
    </View>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────

const ShoppingListScreen = () => {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()

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

  const [addText, setAddText] = useState('')
  const addInputRef = useRef<TextInput>(null)
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
        if (idx === 0) clearCompleted.mutate()
      }
    )
  }, [clearCompleted, t])

  const handleAdd = useCallback(() => {
    const text = addText.trim()
    if (!text) return
    addItems.mutate([text])
    setAddText('')
    setTimeout(() => addInputRef.current?.focus(), 50)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }, [addText, addItems])

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
    },
    [setEditing]
  )

  const handleEditSubmit = useCallback(
    (id: string, originalText: string) => {
      const text = editingText.trim()
      if (text && text !== originalText) {
        editText.mutate({ id, text })
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
              <Pressable
                onPress={() => handleToggle(item.id, item.completed)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
                style={styles.circleBtn}
                accessibilityLabel={t('shoppingList.completedSection')}
              >
                <Feather name="circle" size={22} color={colors.blue} />
              </Pressable>

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
                    accessibilityLabel={isLocked ? t('shoppingList.presenceEditing', { name: editor!.nickname }) : item.text}
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
                  onLongPress={drag}
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

  const ListHeader = useCallback(
    () => <PresenceBar users={presence} />,
    [presence]
  )

  const ListFooter = useCallback(
    () => (
      <View>
        {/* Inline add row */}
        <View style={styles.addRow}>
          <Pressable onPress={() => addInputRef.current?.focus()} hitSlop={8} style={styles.circleBtn}>
            <Feather name="plus-circle" size={22} color={colors.blue} />
          </Pressable>
          <TextInput
            ref={addInputRef}
            style={styles.addInput}
            value={addText}
            onChangeText={setAddText}
            placeholder={t('shoppingList.addItemPlaceholder')}
            placeholderTextColor={colors.placeholderText}
            returnKeyType="done"
            onSubmitEditing={handleAdd}
            blurOnSubmit={false}
            autoCapitalize="sentences"
            autoCorrect
          />
        </View>

        {/* Completed section */}
        {completedItems.length > 0 && (
          <View>
            <View style={styles.separator} />
            <View style={styles.completedHeader}>
              <Text style={styles.completedLabel}>
                {completedItems.length} {t('shoppingList.completedSection')}
              </Text>
              <Pressable onPress={handleClearCompleted} hitSlop={8} accessibilityLabel={t('shoppingList.clearCompleted')}>
                <Text style={styles.clearBtn}>{t('shoppingList.clearCompleted')}</Text>
              </Pressable>
            </View>
            {completedItems.map((item) => (
              <Swipeable key={item.id} renderRightActions={renderRightDelete(item.id, false)} overshootRight={false}>
                <View style={styles.item}>
                  <Pressable
                    onPress={() => handleToggle(item.id, item.completed)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
                    style={styles.circleBtn}
                    accessibilityLabel={t('shoppingList.completedSection')}
                  >
                    <Feather name="check-circle" size={22} color={colors.gray2} />
                  </Pressable>
                  <Text style={[styles.itemText, styles.completedText]}>{item.text}</Text>
                </View>
              </Swipeable>
            ))}
          </View>
        )}

        <View style={{ height: insets.bottom + 24 }} />
      </View>
    ),
    [addText, handleAdd, completedItems, handleToggle, handleClearCompleted, renderRightDelete, t, insets.bottom]
  )

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    )
  }

  return (
    <DraggableFlatList
      data={incompleteItems}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      onDragEnd={({ data }) => reorder.mutate(data.map((i) => i.id))}
      ListHeaderComponent={ListHeader}
      ListFooterComponent={ListFooter}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.listContent}
      ListEmptyComponent={
        completedItems.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Feather name="shopping-cart" size={44} color={colors.gray3} />
            <Text style={styles.emptyText}>{t('shoppingList.emptyList')}</Text>
          </View>
        ) : null
      }
    />
  )
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  listContent: {
    flexGrow: 1,
    backgroundColor: colors.background,
  },
  presenceBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
    backgroundColor: colors.background,
  },
  presenceChip: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presenceInitial: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  clearBtn: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.blue,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  itemActive: {
    backgroundColor: colors.secondaryBackground,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  circleBtn: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textArea: {
    flex: 1,
  },
  itemText: {
    fontSize: 16,
    lineHeight: 21,
    color: colors.label,
  },
  completedText: {
    textDecorationLine: 'line-through',
    color: colors.secondaryLabel,
  },
  lockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  lockDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  lockText: {
    fontSize: 11,
    lineHeight: 13,
    color: colors.secondaryLabel,
  },
  editInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
    color: colors.label,
    padding: 0,
  },
  dragHandle: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  deleteAction: {
    backgroundColor: colors.red,
    justifyContent: 'center',
    alignItems: 'center',
    width: 72,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
    minHeight: 48,
  },
  addInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
    color: colors.label,
    padding: 0,
  },
  separator: {
    height: 24,
    backgroundColor: colors.secondaryBackground,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  completedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  completedLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
    color: colors.secondaryLabel,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyContainer: {
    flex: 1,
    paddingTop: 80,
    alignItems: 'center',
    gap: 16,
  },
  emptyText: {
    fontSize: 16,
    color: colors.secondaryLabel,
    textAlign: 'center',
  },
})

export default ShoppingListScreen
