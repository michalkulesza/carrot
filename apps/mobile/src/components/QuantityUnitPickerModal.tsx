import { useCallback, useEffect, useMemo, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import { BottomSheetModal } from '@gorhom/bottom-sheet'
import { renderSheetBackdrop, sheetStyles } from './ui/sheet'
import { Picker } from '@react-native-picker/picker'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { UNITS } from '@carrot/shared/types'
import {
  parseQtyParts,
  QUANTITY_REMAINDER_OPTIONS,
  serializeQtyParts,
} from '@carrot/shared/utils/ingredientUtils'

const WHOLE_OPTIONS = Array.from({ length: 21 }, (_, i) => i)

export const QuantityUnitPickerModal = ({
  visible,
  qty,
  unit,
  onChange,
  onClose,
}: {
  visible: boolean
  qty: string
  unit: string
  onChange: (qty: string, unit: string) => void
  onClose: () => void
}) => {
  const { t, i18n } = useTranslation()
  const insets = useSafeAreaInsets()
  const sheetRef = useRef<BottomSheetModal>(null)
  const { whole, remainder } = useMemo(() => parseQtyParts(qty), [qty])
  const decimalSeparator = useMemo<'.' | ','>(() =>
    new Intl.NumberFormat(i18n.language).format(1.1).includes(',') ? ',' : '.',
  [i18n.language])
  const sheetStyle = useMemo(
    () => [styles.sheet, { paddingBottom: insets.bottom + 16 }],
    [insets.bottom],
  )

  const handleWholeChange = useCallback(
    (value: number) => onChange(serializeQtyParts(value, remainder, decimalSeparator), unit),
    [remainder, decimalSeparator, unit, onChange],
  )
  const handleRemainderChange = useCallback(
    (value: string) => onChange(serializeQtyParts(whole, value, decimalSeparator), unit),
    [whole, decimalSeparator, unit, onChange],
  )
  const handleUnitChange = useCallback(
    (value: string) => onChange(qty, value),
    [qty, onChange],
  )

  useEffect(() => {
    if (visible) sheetRef.current?.present()
    else sheetRef.current?.dismiss()
  }, [visible])


  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={[340]}
      enableDynamicSizing={false}
      enablePanDownToClose
      onDismiss={onClose}
      backdropComponent={renderSheetBackdrop}
      backgroundStyle={sheetStyles.background}
      handleIndicatorStyle={sheetStyles.handle}
    >
      <View style={sheetStyle}>
        <View style={styles.wheelRow}>
          <Picker
            style={styles.wheel}
            selectedValue={whole}
            onValueChange={handleWholeChange}
            accessibilityLabel={t('units.qtyLabel')}
          >
            {WHOLE_OPTIONS.map((value) => (
              <Picker.Item key={value} label={String(value)} value={value} />
            ))}
          </Picker>
          <Picker
            style={styles.wheel}
            selectedValue={remainder}
            onValueChange={handleRemainderChange}
            accessibilityLabel={t('units.qtyLabel')}
          >
            {QUANTITY_REMAINDER_OPTIONS.map((value) => (
              <Picker.Item
                key={value}
                label={value === '0' ? '—' : value.replace('.', decimalSeparator)}
                value={value}
              />
            ))}
          </Picker>
          <Picker
            style={styles.wheel}
            selectedValue={unit}
            onValueChange={handleUnitChange}
            accessibilityLabel={t('units.unitLabel')}
          >
            <Picker.Item label="—" value="" />
            {UNITS.map((value) => (
              <Picker.Item key={value} label={value} value={value} />
            ))}
          </Picker>
        </View>
      </View>
    </BottomSheetModal>
  )
}

const styles = StyleSheet.create({
  sheet: {},
  wheelRow: { flexDirection: 'row', height: 280 },
  wheel: { flex: 1 },
})
