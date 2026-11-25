import { useCallback, useEffect, useRef, type ReactElement, type ReactNode } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { BottomSheetModal, BottomSheetSectionList } from '@gorhom/bottom-sheet'
import { SearchField } from '../ui'
import { renderSheetBackdrop, sheetStyles } from '../ui/sheet'
import Header, { type DrawerAction } from './Header'
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

export interface SelectionDrawerProps<T> {
  visible: boolean
  onDismiss: () => void
  title: string
  subtitle?: string
  countLabel: string
  action?: DrawerAction
  search: { value: string; onChange: (value: string) => void; placeholder: string }
  chips?: ReactNode
  listHeader?: ReactElement | null
  sections: DrawerSection<T>[]
  renderItem: (item: T) => ReactElement
  keyExtractor: (item: T) => string
  emptyLabel?: string | null
}

const renderSectionHeader = ({ section }: { section: { title: string } }) => (
  <Text style={styles.sectionHeader}>{section.title}</Text>
)

export const SelectionDrawer = <T,>({
  visible,
  onDismiss,
  title,
  subtitle,
  countLabel,
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

  const handleDismiss = useCallback(() => {
    wasPresentedRef.current = false
    onSearchChange('')
    onDismiss()
  }, [onSearchChange, onDismiss])

  const handleRenderItem = useCallback(({ item }: { item: T }) => renderItem(item), [renderItem])

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
      onDismiss={handleDismiss}
      backdropComponent={renderSheetBackdrop}
      backgroundStyle={sheetStyles.background}
      handleIndicatorStyle={sheetStyles.handle}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
    >
      <View style={styles.top}>
        <Header title={title} subtitle={subtitle} countLabel={countLabel} action={action} />
        <SearchField
          value={search.value}
          onChange={onSearchChange}
          placeholder={search.placeholder}
          inSheet
        />
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
      <BottomSheetSectionList
        sections={sections}
        renderItem={handleRenderItem}
        renderSectionHeader={renderSectionHeader}
        keyExtractor={keyExtractor}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={renderEmpty}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
      />
    </BottomSheetModal>
  )
}
