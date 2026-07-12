import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { colors } from '../theme/colors'

export interface NutritionBoxGridItem {
  label: string
  value: string
  accessibilityLabel: string
}

interface NutritionBoxGridProps {
  items: NutritionBoxGridItem[]
  editing: boolean
  onChangeValue?: (index: number, value: string) => void
  disclaimerText: string
}

interface EditableNutritionBoxProps {
  item: NutritionBoxGridItem
  onChangeValue: (value: string) => void
}

const EditableNutritionBox = ({ item, onChangeValue }: EditableNutritionBoxProps) => (
  <View style={styles.box}>
    <TextInput
      style={styles.numberInput}
      value={item.value}
      onChangeText={onChangeValue}
      keyboardType="number-pad"
      placeholder="—"
      placeholderTextColor={colors.placeholderText}
      accessibilityLabel={item.accessibilityLabel}
    />
    <Text style={styles.label}>{item.label}</Text>
  </View>
)

interface NutritionBoxButtonProps {
  item: NutritionBoxGridItem
  displayValue: string
  onPress: () => void
}

const NutritionBoxButton = ({ item, displayValue, onPress }: NutritionBoxButtonProps) => {
  const getPressableStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [styles.box, pressed && styles.boxPressed],
    [],
  )

  return (
    <Pressable style={getPressableStyle} onPress={onPress} accessibilityLabel={item.accessibilityLabel}>
      <Text style={styles.number}>{displayValue}</Text>
      <Text style={styles.label}>{item.label}</Text>
    </Pressable>
  )
}

interface NutritionDisclaimerPopoverProps {
  text: string
  alignRight: boolean
  onDismiss: () => void
}

const NutritionDisclaimerPopover = ({ text, alignRight, onDismiss }: NutritionDisclaimerPopoverProps) => (
  <>
    <Pressable style={styles.backdrop} onPress={onDismiss} accessibilityLabel={text} />
    <View style={[styles.popover, alignRight ? styles.popoverAlignRight : styles.popoverAlignLeft]}>
      <Text style={styles.popoverText}>{text}</Text>
    </View>
  </>
)

interface NutritionBoxProps {
  item: NutritionBoxGridItem
  editing: boolean
  isOpen: boolean
  alignRight: boolean
  disclaimerText: string
  onChangeValue: (value: string) => void
  onToggleOpen: () => void
  onClose: () => void
}

const NutritionBox = ({
  item,
  editing,
  isOpen,
  alignRight,
  disclaimerText,
  onChangeValue,
  onToggleOpen,
  onClose,
}: NutritionBoxProps) => {
  const displayValue = item.value !== '' ? item.value : '—'

  return (
    <View style={styles.boxWrapper}>
      {editing ? (
        <EditableNutritionBox item={item} onChangeValue={onChangeValue} />
      ) : (
        <NutritionBoxButton item={item} displayValue={displayValue} onPress={onToggleOpen} />
      )}

      {isOpen && (
        <NutritionDisclaimerPopover text={disclaimerText} alignRight={alignRight} onDismiss={onClose} />
      )}
    </View>
  )
}

const NutritionBoxGrid = ({
  items,
  editing,
  onChangeValue,
  disclaimerText,
}: NutritionBoxGridProps) => {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <View style={styles.wrapper}>
      <View style={styles.row}>
        {items.map((item, i) => (
          <NutritionBox
            key={item.label}
            item={item}
            editing={editing}
            isOpen={openIndex === i}
            alignRight={i >= items.length - 2}
            disclaimerText={disclaimerText}
            onChangeValue={(value) => onChangeValue?.(i, value)}
            onToggleOpen={() => setOpenIndex((prev) => (prev === i ? null : i))}
            onClose={() => setOpenIndex(null)}
          />
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  boxWrapper: { position: 'relative', flex: 1 },
  box: {
    backgroundColor: colors.secondaryBackground,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  boxPressed: { opacity: 0.7 },
  number: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: colors.label },
  numberInput: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
    color: colors.label,
    textAlign: 'center',
    minWidth: 40,
    padding: 0,
  },
  label: { fontSize: 13, lineHeight: 18, color: colors.secondaryLabel, marginTop: 4 },
  backdrop: {
    position: 'absolute',
    top: -1000,
    left: -1000,
    right: -1000,
    bottom: -1000,
    zIndex: 10,
  },
  popover: {
    position: 'absolute',
    top: '100%',
    marginTop: 8,
    backgroundColor: colors.tertiaryBackground,
    borderRadius: 10,
    padding: 12,
    width: 220,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    zIndex: 20,
  },
  popoverAlignLeft: { left: 0 },
  popoverAlignRight: { right: 0 },
  popoverText: { fontSize: 13, lineHeight: 18, color: colors.label },
})

export default NutritionBoxGrid
