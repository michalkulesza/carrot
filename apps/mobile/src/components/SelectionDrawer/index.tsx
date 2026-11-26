import { useCallback, useEffect, useMemo, useRef, type ReactElement, type ReactNode } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { BottomSheetModal, useBottomSheetScrollableCreator, useBottomSheetSpringConfigs } from '@gorhom/bottom-sheet'
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { renderSheetBackdrop, SheetBackground, sheetStyles } from '../ui/sheet'
import Header, { type DrawerAction } from './Header'
import SearchField from './SearchField'
import { styles } from './styles'
import type { DrawerSection } from './types'

export { default as CreateRow } from './CreateRow'
export { default as QuickAddRow } from './QuickAddRow'
export { default as SelectionChip } from './SelectionChip'
export { default as SelectionRow } from './SelectionRow'
export { useRecipeSections } from './recipeSections'
export { useDrawerSearch } from './useDrawerSearch'
export { SELECTION_CHIP_THUMB_SIZE } from './styles'
export type { DrawerAction } from './Header'
export type { DrawerSection } from './types'

const SNAP_POINTS = ['83%']
// The default spring keeps creeping for a second or two after the sheet looks closed, leaving its shadow on screen.
const SHEET_SPRING = { damping: 80, stiffness: 500, overshootClamping: true, restDisplacementThreshold: 0.1, restSpeedThreshold: 0.1 }

export interface SelectionDrawerProps<T> {
  visible: boolean
  onDismiss: () => void
  title: string
  subtitle?: string
  action?: DrawerAction
  search: { value: string; onChange: (value: string) => void; placeholder: string }
  chips?: ReactNode
  listHeader?: ReactElement | null
  sections: DrawerSection<T>[]
  renderItem: (item: T) => ReactElement
  keyExtractor: (item: T) => string
  emptyLabel?: string | null
}

type DrawerRow<T> = { type: 'header'; key: string; title: string } | { type: 'item'; key: string; item: T }

const getRowKey = <T,>(row: DrawerRow<T>) => row.key

const getRowType = <T,>(row: DrawerRow<T>) => row.type

const flattenSections = <T,>(sections: DrawerSection<T>[], keyExtractor: (item: T) => string): DrawerRow<T>[] =>
  sections.flatMap((section) => [
    { type: 'header' as const, key: `section:${section.key}`, title: section.title },
    ...section.data.map((item) => ({ type: 'item' as const, key: keyExtractor(item), item })),
  ])

export const SelectionDrawer = <T,>({
  visible,
  onDismiss,
  title,
  subtitle,
  action,
  search,
  chips,
  listHeader,
  sections,
  renderItem,
  keyExtractor,
  emptyLabel,
}: SelectionDrawerProps<T>) => {
  const sheetRef = useRef<BottomSheetModal>(null)
  const { top: topInset } = useSafeAreaInsets()
  const wasPresentedRef = useRef(false)

  const { onChange: onSearchChange } = search

  useEffect(() => {
    if (visible) {
      wasPresentedRef.current = true
      sheetRef.current?.present()
    } else if (wasPresentedRef.current) {
      sheetRef.current?.dismiss()
    }
  }, [visible])

  const animationConfigs = useBottomSheetSpringConfigs(SHEET_SPRING)

  // Report the close as soon as it starts, so the drawer can be reopened without waiting for the modal to unmount.
  const notifyClosed = useCallback(() => {
    if (!wasPresentedRef.current) return

    wasPresentedRef.current = false
    onDismiss()
  }, [onDismiss])

  const handleAnimate = useCallback(
    (_fromIndex: number, toIndex: number) => {
      if (toIndex === -1) notifyClosed()
    },
    [notifyClosed],
  )

  const handleDismiss = useCallback(() => {
    notifyClosed()
    if (!wasPresentedRef.current) onSearchChange('')
  }, [notifyClosed, onSearchChange])

  const renderScrollComponent = useBottomSheetScrollableCreator()

  const rows = useMemo(() => flattenSections(sections, keyExtractor), [sections, keyExtractor])

  const renderRow = useCallback(
    ({ item: row }: ListRenderItemInfo<DrawerRow<T>>) =>
      row.type === 'header' ? <Text style={styles.sectionHeader}>{row.title}</Text> : renderItem(row.item),
    [renderItem],
  )

  const renderEmpty = useCallback(
    () => (emptyLabel ? <Text style={styles.empty}>{emptyLabel}</Text> : null),
    [emptyLabel],
  )

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={SNAP_POINTS}
      enableDynamicSizing={false}
      enablePanDownToClose
      animationConfigs={animationConfigs}
      onAnimate={handleAnimate}
      onDismiss={handleDismiss}
      backdropComponent={renderSheetBackdrop}
      backgroundComponent={SheetBackground}
      handleIndicatorStyle={sheetStyles.handle}
      topInset={topInset}
      keyboardBehavior="extend"
      keyboardBlurBehavior="restore"
    >
      <View style={styles.top}>
        <Header title={title} subtitle={subtitle} action={action} />
        <SearchField value={search.value} onChange={onSearchChange} placeholder={search.placeholder} />
        {chips ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={styles.chipScroll}
            contentContainerStyle={styles.chipRow}
          >
            {chips}
          </ScrollView>
        ) : null}
      </View>
      <FlashList
        data={rows}
        renderItem={renderRow}
        keyExtractor={getRowKey}
        getItemType={getRowType}
        renderScrollComponent={renderScrollComponent}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={renderEmpty}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />
    </BottomSheetModal>
  )
}
