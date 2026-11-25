import { memo, useCallback, type ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { BottomSheetTextInput } from '@gorhom/bottom-sheet'
import { SymbolView } from 'expo-symbols'
import { useTranslation } from 'react-i18next'
import { palette, radius, typography } from '../theme'
import { lightHaptic } from './ui/haptics'

export const PICKER_SNAP_POINTS = ['90%']


interface PickerHeaderProps {
  countLabel: string
  title: string
}

export const PickerHeader = memo(({ countLabel, title }: PickerHeaderProps) => (
  <View style={styles.header}>
    <View style={styles.headerSide}>
      <Text style={styles.headerCount}>{countLabel}</Text>
    </View>
    <Text style={styles.headerTitle} accessibilityRole="header">
      {title}
    </Text>
    <View style={styles.headerSide} />
  </View>
))

interface PickerSearchFieldProps {
  value: string
  onChangeText: (value: string) => void
  placeholder: string
}

export const PickerSearchField = memo(({ value, onChangeText, placeholder }: PickerSearchFieldProps) => {
  const { t } = useTranslation()

  const handleClear = useCallback(() => onChangeText(''), [onChangeText])

  return (
    <View style={styles.search}>
      <SymbolView name="magnifyingglass" size={16} weight="semibold" tintColor={palette.textTertiary} />
      <BottomSheetTextInput
        style={styles.searchInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="default"
        returnKeyType="search"
        textContentType="none"
        accessibilityLabel={placeholder}
      />
      {value ? (
        <Pressable
          onPress={handleClear}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('tags.clearSearch')}
        >
          <SymbolView name="xmark.circle.fill" size={18} tintColor={palette.placeholder} />
        </Pressable>
      ) : null}
    </View>
  )
})

interface PickerChipProps {
  label: string
  removeLabel: string
  onRemove: () => void
  leading?: ReactNode
}

export const PickerChip = memo(({ label, removeLabel, onRemove, leading }: PickerChipProps) => {
  const handlePress = useCallback(() => {
    lightHaptic()
    onRemove()
  }, [onRemove])

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={6}
      style={styles.chip}
      accessibilityRole="button"
      accessibilityLabel={removeLabel}
    >
      {leading}
      <Text style={styles.chipLabel} numberOfLines={1}>
        {label}
      </Text>
      <SymbolView name="xmark" size={10} weight="bold" tintColor={palette.actionText} />
    </Pressable>
  )
})

export const PickerChipRow = ({ children }: { children: ReactNode }) => (
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    keyboardShouldPersistTaps="handled"
    style={styles.chipScroll}
    contentContainerStyle={styles.chipRow}
  >
    {children}
  </ScrollView>
)

export const PickerEmpty = ({ label }: { label: string }) => <Text style={styles.empty}>{label}</Text>

export const pickerStyles = StyleSheet.create({
  list: { flex: 1 },
  listContent: { paddingHorizontal: 20, paddingBottom: 32 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.dividerCard },
})

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingTop: 10,
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.dividerCard,
  },
  headerSide: { flex: 1 },
  headerCount: { ...typography.meta, color: palette.textTertiary },
  headerTitle: { ...typography.buttonLarge, fontWeight: '700', color: palette.ink, textAlign: 'center' },
  search: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 12,
    paddingHorizontal: 12,
    borderRadius: radius.control,
    backgroundColor: palette.control,
  },
  searchInput: { flex: 1, paddingVertical: 0, ...typography.body, color: palette.ink },
  chipScroll: { flexGrow: 0, marginTop: 12 },
  chipRow: { gap: 8, paddingHorizontal: 20 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: radius.control,
    backgroundColor: palette.tint,
  },
  chipLabel: { ...typography.pillMedium, color: palette.actionText, flexShrink: 1, maxWidth: 160 },
  empty: { ...typography.tileTitle, fontWeight: '400', color: palette.textTertiary, textAlign: 'center', paddingTop: 32 },
})
