import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  AccessibilityInfo,
  ActivityIndicator,
  Keyboard,
  ScrollView,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { useReducedMotion, useSharedValue } from 'react-native-reanimated'
import { DraxProvider, SortableBoardContainer } from 'react-native-drax'
import { useShoppingList } from '@carrot/shared/hooks/useShoppingList'
import { usePreferences } from '@carrot/shared/hooks/usePreferences'
import type { ShoppingCategory } from '@carrot/shared/types'
import { lightHaptic, selectionHaptic } from '../../components/ui/haptics'
import { useTabScreenInsets } from '../../hooks/useTabScreenInsets'
import { useScreenLoading } from '../../hooks/useScreenLoading'
import { useScreenReaderEnabled } from '../../hooks/useScreenReaderEnabled'
import { createShoppingListItemInput } from '../../utils/uuid'
import AisleCard, { type AisleCardHandlers } from './AisleCard'
import PresenceBar from './PresenceBar'
import ProgressCard from './ProgressCard'
import {
  aislePhases,
  buildShoppingAisles,
  displayedShoppingCategory,
  displayItemText,
  isSamePhases,
  progressOf,
  reuseUnchangedAisles,
  visibleShoppingCategories,
  type RowPhase,
  type ShoppingAisle,
} from './helpers'
import { FRESH_WINDOW_MS } from './motion'
import { styles } from './styles'
import { useAisleCollapse } from './useAisleCollapse'
import { useClearDone } from './useClearDone'
import { useDragAutoScroll } from './useDragAutoScroll'
import { useDragGeometry } from './useDragGeometry'
import { useItemEditing } from './useItemEditing'
import { useKeepScreenOn } from './useKeepScreenOn'
import { useShoppingDrag } from './useShoppingDrag'
import { useShoppingListHeader } from './useShoppingListHeader'
import { useSaveFailedAlert } from './useSaveFailedAlert'
import { useTickSequence } from './useTickSequence'

const SCROLL_BOTTOM_GAP = 16
const SCROLL_TOP_GAP = 16
const NO_PHASES: ReadonlyMap<string, RowPhase> = new Map()

const editingIdIn = (aisle: ShoppingAisle, editingId: string | null) => {
  if (!editingId) return null
  const contains = (item: { id: string }) => item.id === editingId
  return aisle.items.some(contains) || aisle.ticked.some(contains) ? editingId : null
}

const ShoppingListScreen = () => {
  const { t } = useTranslation()
  const insets = useTabScreenInsets()
  const { preferences } = usePreferences()
  const reduceMotion = useReducedMotion()
  const screenReaderEnabled = useScreenReaderEnabled()
  const instant = reduceMotion || screenReaderEnabled
  const [addingCategory, setAddingCategory] = useState<ShoppingCategory | null>(null)
  const dragActiveRef = useRef(false)
  const freshIdsRef = useRef(new Map<string, number>())
  const intendedRef = useRef(new Map<string, boolean>())
  const deletingRef = useRef(new Set<string>())
  const liveAislesRef = useRef<ShoppingAisle[]>([])
  const phasesRef = useRef(new Map<ShoppingCategory, ReadonlyMap<string, RowPhase>>())
  const scrollRef = useRef<ScrollView>(null)
  const dragLockedSV = useSharedValue(false)
  const addingCategoryRef = useRef<ShoppingCategory | null>(null)
  const toggleActionRef = useRef(new Map<string, number>())

  useShoppingListHeader()
  useKeepScreenOn()

  const {
    items,
    incompleteItems,
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
  const { mutateAsync: addItemsAsync } = addItems
  const { mutateAsync: toggleAsync } = toggle
  const { mutateAsync: removeAsync } = remove
  const alertSaveFailed = useSaveFailedAlert()
  const { busy, showSpinner } = useScreenLoading(isLoading)
  const showCompleted = preferences?.show_completed_shopping_items ?? false
  const categories = useMemo(
    () => visibleShoppingCategories(preferences?.shopping_categories),
    [preferences?.shopping_categories]
  )
  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const itemsByIdRef = useRef(itemsById)
  const categoriesRef = useRef(categories)
  const translateRef = useRef(t)
  itemsByIdRef.current = itemsById
  categoriesRef.current = categories
  translateRef.current = t
  addingCategoryRef.current = addingCategory
  const progress = useMemo(() => progressOf(items), [items])
  const lockByItem = useMemo(
    () => new Map(presence.flatMap((user) => (user.item_id ? [[user.item_id, user] as const] : []))),
    [presence]
  )

  const { geometry, emit: emitGeometry } = useDragGeometry()
  const handleAislesSettled = useCallback(() => emitGeometry('measure'), [emitGeometry])
  const { collapsedCategories, progress: aisleProgress, ready, sliding, toggleCategory } = useAisleCollapse({
    instant,
    measurePausedRef: geometry.pausedRef,
    onSettled: handleAislesSettled,
  })
  const { editingId, editingIdRef, handleEditStart, handleEditEnd: endEdit } = useItemEditing({
    commitEdit: editText.mutate,
    setEditing,
  })
  const tick = useTickSequence({ items, showCompleted, instant, dragActiveRef, editingIdRef })
  const {
    startTick,
    startUntick,
    markLocalFlip,
    collapseRow,
    restoreRow,
    releaseRow,
    resetRow,
    resume,
    resumeEdited,
  } = tick

  const liveAisles = useMemo(() => {
    const next = buildShoppingAisles({
      items,
      categories,
      collapsedCategories,
      showCompleted,
      stay: tick.stay,
      grace: tick.grace,
    })
    return reuseUnchangedAisles(liveAislesRef.current, next)
  }, [items, categories, collapsedCategories, showCompleted, tick.stay, tick.grace])
  liveAislesRef.current = liveAisles

  const autoScroll = useDragAutoScroll({
    scrollRef,
    scrollYRef: geometry.scrollYRef,
    topClearance: insets.top,
    bottomClearance: insets.bottom,
  })

  const {
    board,
    boardViewProps,
    displayedAisles,
    dropSpace,
    moveBlocked,
    scrollLocked,
    handleDragStart,
    handleDragEnd,
    handleSnapEnd,
    handleReorder,
    handlePositionChange,
  } = useShoppingDrag({
    aisles: liveAisles,
    categories,
    incompleteItems,
    reduceMotion,
    reorder: reorder.mutate,
    dragActiveRef,
    onDragSettled: resume,
    onDragOver: autoScroll.update,
    onDragStop: autoScroll.stop,
  })

  const hasVisibleCompleted = useMemo(
    () => displayedAisles.some((aisle) => aisle.ticked.length > 0 || aisle.items.some((item) => item.completed)),
    [displayedAisles]
  )
  const { clearing, handleClear } = useClearDone({
    completedCount: progress.done,
    hasVisibleCompleted,
    instant,
    dragActiveRef,
    clearCompleted: clearCompleted.mutate,
  })
  const dragLocked = clearing || tick.animating || sliding.size > 0

  // Checked when a drag activates instead of flipping every row's `draggable` (which rebuilds each gesture).
  useLayoutEffect(() => {
    dragLockedSV.value = dragLocked
  }, [dragLocked, dragLockedSV])

  const phasesByCategory = useMemo(() => {
    const next = new Map<ShoppingCategory, ReadonlyMap<string, RowPhase>>()
    for (const aisle of displayedAisles) {
      const phases = aislePhases(aisle, tick.phases, clearing)
      const previous = phasesRef.current.get(aisle.category)
      next.set(aisle.category, previous && isSamePhases(previous, phases) ? previous : phases)
    }
    phasesRef.current = next
    return next
  }, [displayedAisles, tick.phases, clearing])

  useEffect(() => {
    itemsById.forEach((item, id) => {
      if (intendedRef.current.get(id) === item.completed) intendedRef.current.delete(id)
    })
  }, [itemsById])

  const announce = useCallback((message: string) => {
    if (screenReaderEnabled) AccessibilityInfo.announceForAccessibility(message)
  }, [screenReaderEnabled])

  const aisleNameOf = useCallback(
    (category: ShoppingCategory) => t(`shoppingList.categories.${category}`),
    [t]
  )
  const aisleNameOfRef = useRef(aisleNameOf)
  aisleNameOfRef.current = aisleNameOf

  const isFresh = useCallback((id: string) => {
    const addedAt = freshIdsRef.current.get(id)
    return addedAt !== undefined && Date.now() - addedAt < FRESH_WINDOW_MS
  }, [])

  const handleToggle = useCallback((id: string) => {
    if (dragActiveRef.current) return

    const item = itemsByIdRef.current.get(id)
    if (!item) return

    const translate = translateRef.current
    const completed = intendedRef.current.get(id) ?? item.completed
    const displayText = displayItemText(item.text, translate)
    const aisle = aisleNameOfRef.current(displayedShoppingCategory(item, categoriesRef.current))
    const action = (toggleActionRef.current.get(id) ?? 0) + 1
    toggleActionRef.current.set(id, action)
    intendedRef.current.set(id, !completed)
    markLocalFlip(id)

    if (completed) {
      selectionHaptic()
      startUntick({ ...item, completed })
      announce(translate('shoppingList.untickedAnnouncement', { item: displayText }))
    } else {
      lightHaptic()
      startTick({ ...item, completed })
      announce(translate('shoppingList.tickedAnnouncement', { item: displayText, aisle }))
    }

    const handleError = () => {
      alertSaveFailed()
      if (toggleActionRef.current.get(id) !== action) return

      intendedRef.current.delete(id)
      resetRow(id)
    }
    toggleAsync({ id, completed }).catch(handleError)
  }, [markLocalFlip, startUntick, startTick, announce, resetRow, toggleAsync, alertSaveFailed])

  const handleDelete = useCallback((id: string) => {
    if (deletingRef.current.has(id)) return

    deletingRef.current.add(id)
    lightHaptic()

    const handleError = () => {
      restoreRow(id)
      alertSaveFailed()
    }
    const handleSettled = () => {
      deletingRef.current.delete(id)
      releaseRow(id)
    }
    collapseRow(id, () => removeAsync(id).catch(handleError).finally(handleSettled))
  }, [collapseRow, releaseRow, removeAsync, restoreRow, alertSaveFailed])

  const handleAdd = useCallback((category: ShoppingCategory, text: string) => {
    const input = createShoppingListItemInput(text, category)
    freshIdsRef.current.set(input.id, Date.now())
    addItemsAsync([input]).catch(alertSaveFailed)
    lightHaptic()
    announce(t('shoppingList.itemAddedAnnouncement', { item: text, aisle: aisleNameOf(category) }))
  }, [addItemsAsync, alertSaveFailed, announce, t, aisleNameOf])

  const handleEditEnd = useCallback((id: string, initialText: string, nextText: string) => {
    endEdit(id, initialText, nextText)
    resumeEdited(id)
  }, [endEdit, resumeEdited])

  const handleOpenAdd = useCallback((category: ShoppingCategory) => setAddingCategory(category), [])

  const handleCloseAdd = useCallback(
    (category: ShoppingCategory) => setAddingCategory((current) => (current === category ? null : current)),
    []
  )

  const handleToggleAisle = useCallback((category: ShoppingCategory) => {
    if (dragActiveRef.current) return

    if (addingCategoryRef.current === category) {
      setAddingCategory(null)
      Keyboard.dismiss()
    }
    selectionHaptic()
    toggleCategory(category)
  }, [toggleCategory])

  const handlers = useMemo<AisleCardHandlers>(() => ({
    isFresh,
    onToggleAisle: handleToggleAisle,
    onReorder: handleReorder,
    onPositionChange: handlePositionChange,
    onSnapEnd: handleSnapEnd,
    onToggleItem: handleToggle,
    onDelete: handleDelete,
    onEditStart: handleEditStart,
    onEditEnd: handleEditEnd,
    onOpenAdd: handleOpenAdd,
    onCloseAdd: handleCloseAdd,
    onAdd: handleAdd,
  }), [
    isFresh,
    handleToggleAisle,
    handleReorder,
    handlePositionChange,
    handleSnapEnd,
    handleToggle,
    handleDelete,
    handleEditStart,
    handleEditEnd,
    handleOpenAdd,
    handleCloseAdd,
    handleAdd,
  ])

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    geometry.scrollYRef.current = event.nativeEvent.contentOffset.y
    if (dragActiveRef.current) emitGeometry('scroll')
  }, [geometry, emitGeometry])

  const handleTouchStart = useCallback(() => emitGeometry('measure'), [emitGeometry])

  const { handleViewportLayout, handleContentSizeChange } = autoScroll
  const handleScrollLayout = useCallback(
    (event: LayoutChangeEvent) => handleViewportLayout(event.nativeEvent.layout.height),
    [handleViewportLayout]
  )

  const contentContainerStyle = useMemo(
    () => ({ paddingTop: insets.top + SCROLL_TOP_GAP, paddingBottom: insets.bottom + SCROLL_BOTTOM_GAP }),
    [insets.top, insets.bottom]
  )

  if (busy || !ready) {
    return <View style={styles.center}>{showSpinner ? <ActivityIndicator size="large" /> : null}</View>
  }

  return (
    <View style={styles.screen}>
      <DraxProvider onDragStart={handleDragStart} onDragEnd={handleDragEnd} dragLockedSV={dragLockedSV}>
        <SortableBoardContainer board={board} style={styles.flex} draxViewProps={boardViewProps}>
          <ScrollView
            ref={scrollRef}
            scrollEnabled={!scrollLocked}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            onTouchStart={handleTouchStart}
            onLayout={handleScrollLayout}
            onContentSizeChange={handleContentSizeChange}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
            contentInsetAdjustmentBehavior="never"
            contentContainerStyle={contentContainerStyle}
          >
            <PresenceBar users={presence} />
            <ProgressCard
              done={progress.done}
              total={progress.total}
              value={progress.value}
              canClear={progress.done > 0 && !clearing}
              onClear={handleClear}
            />
            {displayedAisles.map((aisle) => (
              <AisleCard
                key={aisle.category}
                aisle={aisle}
                progress={aisleProgress[aisle.category]}
                dropSpace={dropSpace[aisle.category]}
                phases={phasesByCategory.get(aisle.category) ?? NO_PHASES}
                lockByItem={lockByItem}
                editingId={editingIdIn(aisle, editingId)}
                addOpen={addingCategory === aisle.category}
                sliding={sliding.has(aisle.category)}
                instant={instant}
                reduceMotion={reduceMotion}
                boardMoveBlocked={moveBlocked}
                geometry={geometry}
                handlers={handlers}
              />
            ))}
          </ScrollView>
        </SortableBoardContainer>
      </DraxProvider>
    </View>
  )
}

export default ShoppingListScreen
