import { useCallback, useMemo, useState } from 'react'
import {
  Alert,
  FlatList,
  Modal,
  PlatformColor,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { UNITS } from '@carrot/shared/types'
import type { AllergenFlag, Tag } from '@carrot/shared/types'
import type { StructuredIngredient } from '@carrot/shared/utils/ingredientUtils'
import { tTag } from '@carrot/shared/utils/tagUtils'
import { TAG_CATEGORIES, groupTagsByCategory } from '@carrot/shared/utils/tagFilters'
import { colors } from '../theme/colors'

// Shared editing controls used by both the import flow and in-place recipe editing.

export const UNIT_OPTIONS: string[] = ['', ...UNITS]

export const UnitPickerModal = ({
  visible,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean
  selected: string
  onSelect: (u: string) => void
  onClose: () => void
}) => {
  const { t } = useTranslation()

  const getUnitOptionStyle = useCallback(
    (item: string) =>
      ({ pressed }: { pressed: boolean }) => [
        styles.unitOption,
        item === selected && styles.unitOptionSel,
        pressed && styles.pressedLight,
      ],
    [selected],
  )

  const handleSelect = useCallback(
    (item: string) => {
      onSelect(item)
      onClose()
    },
    [onSelect, onClose],
  )

  const renderUnitOption = useCallback(
    ({ item }: { item: string }) => {
      const isSelected = item === selected
      const unitLabel = item ? t(`units.${item}`) : '—'
      const unitDisplayText = item ? `${item}  ·  ${unitLabel}` : '—'

      return (
        <Pressable
          style={getUnitOptionStyle(item)}
          onPress={() => handleSelect(item)}
          accessibilityLabel={unitLabel}
          accessibilityState={{ selected: isSelected }}
        >
          <Text style={[styles.unitOptionText, isSelected && styles.unitOptionTextSel]}>
            {unitDisplayText}
          </Text>
        </Pressable>
      )
    },
    [selected, getUnitOptionStyle, handleSelect, t],
  )

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose} />
      <View style={styles.unitSheet}>
        <View style={styles.sheetHandle} />
        <FlatList
          data={UNIT_OPTIONS}
          keyExtractor={(item) => item || '__none__'}
          renderItem={renderUnitOption}
          contentContainerStyle={styles.unitListContent}
        />
      </View>
    </Modal>
  )
}

export const TagPickerModal = ({
  visible,
  allTags,
  selectedIds,
  onAdd,
  onRemove,
  onCreate,
  onClose,
}: {
  visible: boolean
  allTags: Tag[]
  selectedIds: Set<string>
  onAdd: (tag: Tag) => void
  onRemove: (tagId: string) => void
  onCreate: (name: string) => Promise<Tag>
  onClose: () => void
}) => {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)

  const tagModalPaddingBottom = useMemo(() => ({ paddingBottom: insets.bottom + 24 }), [insets.bottom])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return allTags.filter((tag) => !q || tag.name.toLowerCase().includes(q))
  }, [allTags, query])

  const groupedSections = useMemo(() => {
    const grouped = groupTagsByCategory(filtered)
    const selectedFirst = (tags: Tag[]) =>
      [...tags].sort((a, b) => Number(selectedIds.has(b.id)) - Number(selectedIds.has(a.id)))
    return [
      ...TAG_CATEGORIES.map((category) => ({
        key: category,
        title: t(`tags.category.${category}`),
        tags: selectedFirst(grouped[category]),
      })),
      { key: 'other', title: t('tags.category.other'), tags: selectedFirst(grouped.other) },
    ].filter((section) => section.tags.length > 0)
  }, [filtered, t, selectedIds])

  const trimmedQuery = query.trim()
  const exactMatch = allTags.some((tag) => tag.name.toLowerCase() === trimmedQuery.toLowerCase())
  const canCreate = trimmedQuery.length > 0 && !exactMatch

  const handleCreate = useCallback(async () => {
    if (!trimmedQuery) return

    setCreating(true)
    try {
      const tag = await onCreate(trimmedQuery)
      onAdd(tag)
      setQuery('')
    } finally {
      setCreating(false)
    }
  }, [trimmedQuery, onCreate, onAdd])

  const handleTagRowPress = useCallback(
    (tag: Tag) => {
      if (selectedIds.has(tag.id)) {
        onRemove(tag.id)
        return
      }

      onAdd(tag)
    },
    [selectedIds, onAdd, onRemove],
  )

  const getCloseButtonStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [pressed && styles.pressedLight],
    [],
  )
  const getCreateRowStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [styles.tagCreateRow, pressed && styles.pressedLight],
    [],
  )
  const getTagListRowStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [styles.tagListRow, pressed && styles.pressedLight],
    [],
  )

  const createTagLabel = t('tags.createTag', { name: trimmedQuery })
  const createTagText = creating ? t('tags.creating') : createTagLabel

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.tagModalOverlay} onPress={onClose} />
      <View style={[styles.tagModal, tagModalPaddingBottom]}>
        <View style={styles.sheetHandle} />
        <View style={styles.tagModalHeader}>
          <Text style={styles.tagModalTitle}>{t('tags.editTags')}</Text>
          <Pressable
            style={getCloseButtonStyle}
            onPress={onClose}
            hitSlop={12}
            accessibilityLabel={t('common.close')}
          >
            <Text style={styles.tagModalClose}>✕</Text>
          </Pressable>
        </View>
        <TextInput
          style={styles.tagSearch}
          placeholder={t('tags.searchOrCreate')}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="default"
          returnKeyType="search"
          textContentType="none"
          accessibilityLabel={t('tags.searchOrCreate')}
        />
        <ScrollView style={styles.tagScrollList} keyboardShouldPersistTaps="handled">
          {canCreate && (
            <Pressable
              style={getCreateRowStyle}
              onPress={handleCreate}
              disabled={creating}
              accessibilityLabel={createTagLabel}
            >
              <Text style={styles.tagCreateText}>{createTagText}</Text>
            </Pressable>
          )}
          {groupedSections.map((section) => (
            <View key={section.key}>
              <Text style={styles.tagSectionHeader}>{section.title}</Text>
              {section.tags.map((tag) => {
                const isSelected = selectedIds.has(tag.id)
                return (
                  <Pressable
                    key={tag.id}
                    style={getTagListRowStyle}
                    onPress={() => handleTagRowPress(tag)}
                    accessibilityLabel={tag.name}
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Text style={styles.tagListText}>{tTag(tag.name, t)}</Text>
                    {isSelected && <Text style={styles.tagCheck}>✓</Text>}
                  </Pressable>
                )
              })}
            </View>
          ))}
          {filtered.length === 0 && !canCreate && (
            <Text style={styles.tagEmpty}>{t('tags.noTagsAvailable')}</Text>
          )}
        </ScrollView>
      </View>
    </Modal>
  )
}

export const IngredientEditor = ({
  value,
  flag,
  activeAllergens,
  onChange,
  onUnitPress,
  onReplace,
  onRestore,
  onRemove,
}: {
  value: StructuredIngredient
  flag: AllergenFlag | null
  activeAllergens: string[]
  onChange: (v: StructuredIngredient) => void
  onUnitPress: () => void
  onReplace: () => void
  onRestore: () => void
  onRemove?: () => void
}) => {
  const { t } = useTranslation()

  const isAllergenActive = flag?.allergen
    ? activeAllergens.some((a) => {
        const fa = flag.allergen!.toLowerCase()
        const la = a.toLowerCase()
        return fa === la || fa.includes(la) || la.includes(fa)
      })
    : false

  const handleAllergenPress = useCallback(() => {
    if (!flag?.allergen) return

    const title = `${t('recipes.contains')}: ${flag.allergen}`

    if (flag.substitute_applied && flag.original_display) {
      const message = `${t('recipes.originally')} ${flag.original_display}, ${t('recipes.replacedWith')} ${flag.substitute} ${t('recipes.dueTo')} ${flag.allergen}.`
      Alert.alert(title, message, [
        { text: t('recipes.restoreOriginal'), onPress: onRestore },
        { text: t('common.cancel'), style: 'cancel' },
      ])
    } else if (flag.substitute) {
      const message = `${t('recipes.suggestedSubstitute')} ${flag.substitute}`
      Alert.alert(title, message, [
        { text: t('recipes.replace'), onPress: onReplace },
        { text: t('recipes.keepOriginal'), style: 'cancel' },
      ])
    } else {
      Alert.alert(title, t('recipes.noSubstituteAvailable'))
    }
  }, [flag, onRestore, onReplace, t])

  const getRemoveButtonStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [styles.ingRemoveBtn, pressed && styles.pressedMedium],
    [],
  )
  const getUnitButtonStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [styles.ingUnitBtn, pressed && styles.pressedLight],
    [],
  )
  const getAllergenBadgeStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [styles.allergenBadge, pressed && styles.pressedLight],
    [],
  )

  const handleQtyChange = useCallback((qty: string) => onChange({ ...value, qty }), [value, onChange])
  const handleNameChange = useCallback((name: string) => onChange({ ...value, name }), [value, onChange])

  const unitLabel = value.unit ? t(`units.${value.unit}`) : t('units.unitLabel')
  const allergenAccessibilityLabel = flag?.allergen ? `${t('recipes.contains')} ${flag.allergen}` : ''

  return (
    <View style={styles.ingEditor}>
      <View style={styles.ingRow}>
        {onRemove && (
          <Pressable
            style={getRemoveButtonStyle}
            onPress={onRemove}
            hitSlop={11}
            accessibilityLabel={t('addRecipe.removeIngredient')}
          >
            <Text style={styles.ingRemoveText}>−</Text>
          </Pressable>
        )}
        <TextInput
          style={styles.ingQty}
          value={value.qty}
          onChangeText={handleQtyChange}
          placeholder={t('units.qtyLabel')}
          keyboardType="decimal-pad"
          returnKeyType="done"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="none"
          accessibilityLabel={t('units.qtyLabel')}
        />
        <Pressable
          style={getUnitButtonStyle}
          onPress={onUnitPress}
          hitSlop={10}
          accessibilityLabel={unitLabel}
        >
          <Text style={[styles.ingUnitText, !value.unit && styles.ingPlaceholder]}>
            {value.unit || '—'}
          </Text>
        </Pressable>
        <TextInput
          style={styles.ingName}
          value={value.name}
          onChangeText={handleNameChange}
          keyboardType="default"
          returnKeyType="done"
          autoCapitalize="words"
          autoCorrect={false}
          textContentType="none"
          accessibilityLabel={t('addRecipe.ingredientName')}
        />
        {isAllergenActive && (
          <Pressable
            style={getAllergenBadgeStyle}
            onPress={handleAllergenPress}
            hitSlop={10}
            accessibilityLabel={allergenAccessibilityLabel}
          >
            <Text style={styles.allergenText}>⚠ {flag!.allergen}</Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  pressedLight: { opacity: 0.7 },
  pressedMedium: { opacity: 0.6 },

  tagModalOverlay: { flex: 1, backgroundColor: 'transparent' },
  tagModal: {
    backgroundColor: PlatformColor('systemBackground') as unknown as string,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    maxHeight: '72%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  tagModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8 },
  tagModalTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: PlatformColor('label') as unknown as string },
  tagModalClose: { fontSize: 17, color: PlatformColor('secondaryLabel') as unknown as string, padding: 4 },
  tagSearch: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: PlatformColor('opaqueSeparator') as unknown as string,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    color: PlatformColor('label') as unknown as string,
  },
  tagScrollList: { maxHeight: 320 },
  tagSectionHeader: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: PlatformColor('label') as unknown as string,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  tagCreateRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.brandLight,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: PlatformColor('separator') as unknown as string,
  },
  tagCreateText: { fontSize: 16, color: colors.brand, fontWeight: '600' },
  tagListRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: PlatformColor('separator') as unknown as string,
  },
  tagListText: { fontSize: 16, color: PlatformColor('secondaryLabel') as unknown as string },
  tagCheck: { fontSize: 16, color: colors.brand },
  tagEmpty: { padding: 16, fontSize: 13, lineHeight: 18, color: PlatformColor('tertiaryLabel') as unknown as string, textAlign: 'center' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  unitSheet: {
    backgroundColor: PlatformColor('systemBackground') as unknown as string,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
    maxHeight: '60%',
  },
  unitListContent: { paddingBottom: 32 },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: PlatformColor('opaqueSeparator') as unknown as string,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 8,
  },
  unitOption: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: PlatformColor('separator') as unknown as string,
  },
  unitOptionSel: { backgroundColor: colors.brandLight },
  unitOptionText: { fontSize: 16, color: PlatformColor('secondaryLabel') as unknown as string },
  unitOptionTextSel: { color: colors.brand, fontWeight: '600' },

  ingEditor: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: PlatformColor('separator') as unknown as string,
    gap: 4,
  },
  ingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ingRemoveBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: PlatformColor('systemRed') as unknown as string,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ingRemoveText: { fontSize: 16, color: '#fff', fontWeight: '600', lineHeight: 20 },
  ingQty: {
    width: 44,
    borderBottomWidth: 1,
    borderColor: PlatformColor('opaqueSeparator') as unknown as string,
    fontSize: 16,
    color: PlatformColor('label') as unknown as string,
    textAlign: 'center',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  ingUnitBtn: {
    borderBottomWidth: 1,
    borderColor: PlatformColor('opaqueSeparator') as unknown as string,
    paddingVertical: 4,
    paddingHorizontal: 4,
    minWidth: 36,
  },
  ingUnitText: { fontSize: 13, lineHeight: 18, color: colors.brand, fontWeight: '600' },
  ingPlaceholder: { color: PlatformColor('tertiaryLabel') as unknown as string },
  ingName: {
    flex: 1,
    borderBottomWidth: 1,
    borderColor: PlatformColor('opaqueSeparator') as unknown as string,
    fontSize: 16,
    color: PlatformColor('label') as unknown as string,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  allergenBadge: {
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#f59e0b',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 4,
  },
  allergenText: { fontSize: 11, lineHeight: 13, color: '#92400e', fontWeight: '600' },
})
