import { useCallback, useMemo } from 'react'
import { Modal, PlatformColor, Pressable, StyleSheet, Text, View } from 'react-native'
import { Picker } from '@react-native-picker/picker'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { UNITS } from '@carrot/shared/types'
import {
  parseQtyParts,
  QUANTITY_REMAINDER_OPTIONS,
  serializeQtyParts,
} from '@carrot/shared/utils/ingredientUtils'
import { colors } from '../theme/colors'

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

  const getDoneButtonStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [styles.doneButton, pressed && styles.pressedLight],
    [],
  )

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={sheetStyle}>
        <View style={styles.header}>
          <View style={styles.sheetHandle} />
          <Pressable
            style={getDoneButtonStyle}
            onPress={onClose}
            hitSlop={10}
            accessibilityLabel={t('common.done')}
          >
            <Text style={styles.doneText}>{t('common.done')}</Text>
          </Pressable>
        </View>
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
    </Modal>
  )
}

const styles = StyleSheet.create({
  pressedLight: { opacity: 0.7 },
  overlay: { flex: 1 },
  sheet: {
    backgroundColor: PlatformColor('systemBackground') as unknown as string,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  header: {
    paddingTop: 8,
    paddingHorizontal: 16,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: PlatformColor('opaqueSeparator') as unknown as string,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 8,
  },
  doneButton: {
    alignSelf: 'flex-end',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  doneText: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: colors.brand },
  wheelRow: { flexDirection: 'row', height: 280 },
  wheel: { flex: 1 },
})
