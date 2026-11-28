import { useCallback, useEffect, useRef } from 'react'
import { Feather } from '@expo/vector-icons'
import { BottomSheetScrollView, type BottomSheetModal } from '@gorhom/bottom-sheet'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AppText, SettingsGroup, SettingsRow } from '../ui'
import { AppSheet } from '../ui/sheet'
import { palette, space } from '../../theme'
import { styles } from './styles'
import type { ActionMenuOption, ActionMenuOptions } from './types'

const SNAP_POINTS = ['55%']
const CHECK_SIZE = 20

const SelectedCheck = <Feather name="check" size={CHECK_SIZE} color={palette.actionText} />

interface ActionMenuRowProps {
  option: ActionMenuOption
  onSelect: (option: ActionMenuOption) => void
}

const ActionMenuRow = ({ option, onSelect }: ActionMenuRowProps) => {
  const handlePress = useCallback(() => onSelect(option), [onSelect, option])

  return (
    <SettingsRow
      title={option.label}
      tone={option.destructive ? 'destructive' : 'default'}
      accessory={option.selected ? SelectedCheck : 'none'}
      selected={option.selected}
      onPress={handlePress}
    />
  )
}

interface ActionMenuSheetProps {
  request: ActionMenuOptions
  onSettled: (selected: ActionMenuOption | null) => void
}

const ActionMenuSheet = ({ request, onSettled }: ActionMenuSheetProps) => {
  const insets = useSafeAreaInsets()
  const sheetRef = useRef<BottomSheetModal>(null)
  const selectedRef = useRef<ActionMenuOption | null>(null)
  const contentStyle = [styles.body, { paddingBottom: Math.max(insets.bottom, space.lg) }]

  useEffect(() => {
    sheetRef.current?.present()
  }, [])

  const handleSelect = useCallback((option: ActionMenuOption) => {
    if (selectedRef.current) return
    selectedRef.current = option
    sheetRef.current?.dismiss()
  }, [])

  const handleDismiss = useCallback(() => onSettled(selectedRef.current), [onSettled])

  return (
    <AppSheet ref={sheetRef} snapPoints={SNAP_POINTS} enableDynamicSizing={false} onDismiss={handleDismiss}>
      <BottomSheetScrollView contentContainerStyle={contentStyle}>
        {request.title ? (
          <AppText variant="bodyLarge" style={styles.title} accessibilityRole="header">
            {request.title}
          </AppText>
        ) : null}
        {request.message ? (
          <AppText variant="meta" tone="textSecondary" style={styles.message}>
            {request.message}
          </AppText>
        ) : null}
        <SettingsGroup>
          {request.options.map((option) => (
            <ActionMenuRow key={option.label} option={option} onSelect={handleSelect} />
          ))}
        </SettingsGroup>
      </BottomSheetScrollView>
    </AppSheet>
  )
}

export default ActionMenuSheet
