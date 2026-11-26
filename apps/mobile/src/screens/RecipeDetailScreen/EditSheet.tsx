import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Pressable, Text, useWindowDimensions, View } from 'react-native'
import { type BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { AppSheet } from '../../components/ui/sheet'
import { lightHaptic } from '../../components/ui/haptics'
import { styles } from './styles'

const MIN_HEIGHT_RATIO = 1 / 2

interface EditSheetProps {
  visible: boolean
  title: string
  removeLabel: string
  canRemove: boolean
  onRemove: () => void
  onDismiss: () => void
  children: ReactNode
}

const EditSheet = ({ visible, title, removeLabel, canRemove, onRemove, onDismiss, children }: EditSheetProps) => {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { height: windowHeight } = useWindowDimensions()
  const sheetRef = useRef<BottomSheetModal>(null)
  const wasPresentedRef = useRef(false)

  const bodyStyle = useMemo(
    () => [styles.editSheetBody, { paddingBottom: insets.bottom, minHeight: windowHeight * MIN_HEIGHT_RATIO }],
    [insets.bottom, windowHeight],
  )

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
    onDismiss()
  }, [onDismiss])

  const handleRemove = useCallback(() => {
    lightHaptic()
    onRemove()
  }, [onRemove])

  return (
    <AppSheet
      ref={sheetRef}
      onDismiss={handleDismiss}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
    >
      <BottomSheetView style={bodyStyle}>
        <View style={styles.editSheetHeader}>
          <View style={styles.editSheetHeaderSide}>
            {canRemove ? (
              <Pressable
                onPress={handleRemove}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={removeLabel}
              >
                <Text style={styles.editSheetRemove}>{t('common.remove')}</Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.editSheetTitle} accessibilityRole="header">
            {title}
          </Text>
          <View style={styles.editSheetHeaderSide} />
        </View>
        {children}
      </BottomSheetView>
    </AppSheet>
  )
}

export default EditSheet
