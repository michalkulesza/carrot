import { useCallback, useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { BottomSheetView, type BottomSheetModal } from '@gorhom/bottom-sheet'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AppText, Button } from '../ui'
import { AppSheet } from '../ui/sheet'
import { space } from '../../theme'
import SheetInput from '../AddRecipeDrawer/SheetInput'
import { styles } from './styles'
import type { PromptOptions } from './types'

const SNAP_POINTS = ['50%']
const INPUT_STYLE = { flex: 0 } as const

interface PromptSheetProps {
  request: PromptOptions
  onSettled: (value: string | null) => void
}

const PromptSheet = ({ request, onSettled }: PromptSheetProps) => {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const sheetRef = useRef<BottomSheetModal>(null)
  const confirmedValueRef = useRef<string | null>(null)
  const confirmedRef = useRef(false)
  const [value, setValue] = useState(request.defaultValue ?? '')
  const bodyStyle = [styles.body, { paddingBottom: Math.max(insets.bottom, space.lg) }]

  useEffect(() => {
    sheetRef.current?.present()
  }, [])

  const handleConfirm = useCallback(() => {
    if (confirmedRef.current) return
    confirmedRef.current = true
    confirmedValueRef.current = value
    sheetRef.current?.dismiss()
  }, [value])

  const handleDismiss = useCallback(() => onSettled(confirmedValueRef.current), [onSettled])

  return (
    <AppSheet
      ref={sheetRef}
      snapPoints={SNAP_POINTS}
      enableDynamicSizing={false}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      onDismiss={handleDismiss}
    >
      <BottomSheetView style={bodyStyle}>
        <AppText variant="bodyLarge" style={styles.title} accessibilityRole="header">
          {request.title}
        </AppText>
        {request.message ? (
          <AppText variant="meta" tone="textSecondary" style={styles.message}>
            {request.message}
          </AppText>
        ) : null}
        <View style={styles.inputRow}>
          <SheetInput
            variant="field"
            style={INPUT_STYLE}
            value={value}
            onChangeText={setValue}
            placeholder={request.placeholder}
            autoFocus
            autoCorrect={false}
            autoCapitalize={request.autoCapitalize}
            keyboardType={request.keyboardType}
            textContentType={request.textContentType}
            returnKeyType="done"
            onSubmitEditing={handleConfirm}
            accessibilityLabel={request.title}
          />
        </View>
        <Button
          size="xl"
          fullWidth
          variant={request.destructive ? 'destructive' : 'primary'}
          label={request.confirmLabel ?? t('common.ok')}
          onPress={handleConfirm}
        />
      </BottomSheetView>
    </AppSheet>
  )
}

export default PromptSheet
