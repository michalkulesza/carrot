import { useState } from 'react'
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
          <View key={item.label} style={styles.boxWrapper}>
            {editing ? (
              <View style={styles.box}>
                <TextInput
                  style={styles.numberInput}
                  value={item.value}
                  onChangeText={(v) => onChangeValue?.(i, v)}
                  keyboardType="number-pad"
                  placeholder="—"
                  placeholderTextColor={colors.placeholderText}
                  accessibilityLabel={item.accessibilityLabel}
                />
                <Text style={styles.label}>{item.label}</Text>
              </View>
            ) : (
              <Pressable
                style={({ pressed }) => [styles.box, pressed && { opacity: 0.7 }]}
                onPress={() => setOpenIndex((prev) => (prev === i ? null : i))}
                accessibilityLabel={item.accessibilityLabel}
              >
                <Text style={styles.number}>{item.value !== '' ? item.value : '—'}</Text>
                <Text style={styles.label}>{item.label}</Text>
              </Pressable>
            )}

            {openIndex === i && (
              <>
                <Pressable
                  style={styles.backdrop}
                  onPress={() => setOpenIndex(null)}
                  accessibilityLabel={disclaimerText}
                />
                <View style={styles.popover}>
                  <Text style={styles.popoverText}>{disclaimerText}</Text>
                </View>
              </>
            )}
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  boxWrapper: { position: 'relative', flex: 1 },
  box: {
    backgroundColor: colors.secondaryBackground,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: 'center',
    width: '100%',
  },
  number: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: colors.label },
  numberInput: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
    color: colors.label,
    textAlign: 'center',
    width: '100%',
    padding: 0,
  },
  label: { fontSize: 13, lineHeight: 18, color: colors.secondaryLabel, marginTop: 2 },
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
    left: 0,
    marginTop: 6,
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
  popoverText: { fontSize: 13, lineHeight: 18, color: colors.label },
})

export default NutritionBoxGrid
