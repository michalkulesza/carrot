import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  PlatformColor,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView, BottomSheetTextInput, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import type { AllergenFlag, Tag } from '@carrot/shared/types'
import type { StructuredIngredient } from '@carrot/shared/utils/ingredientUtils'
import { tTag } from '@carrot/shared/utils/tagUtils'
import { TAG_CATEGORIES, groupTagsByCategory } from '@carrot/shared/utils/tagFilters'
import { colors } from '../theme/colors'
import CheckboxIcon from './CheckboxIcon'

// Shared editing controls used by both the import flow and in-place recipe editing.

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
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const sheetRef = useRef<BottomSheetModal>(null)
  const wasPresentedRef = useRef(false)

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
  const canCreate = trimmedQuery.length > 0 && !allTags.some((tag) => tag.name.toLowerCase() === trimmedQuery.toLowerCase())
  const handleCreate = useCallback(async () => { setCreating(true); try { const tag = await onCreate(trimmedQuery); onAdd(tag); setQuery('') } finally { setCreating(false) } }, [onAdd, onCreate, trimmedQuery])

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

  const getTagListRowStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [styles.tagListRow, pressed && styles.pressedLight],
    [],
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
    onClose()
  }, [onClose])

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
    ),
    [],
  )

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={['72%']}
      enableDynamicSizing={false}
      enablePanDownToClose
      onDismiss={handleDismiss}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.sheetBackground}
      handleIndicatorStyle={styles.sheetHandle}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
    >
      <View style={styles.tagModal}>
          <View style={styles.tagModalHeader}>
            <Text style={styles.tagModalTitle}>{t('tags.editTags')}</Text>
          </View>
          <View style={styles.tagSearchContainer}>
            <Ionicons name="search" size={16} color={PlatformColor('secondaryLabel') as unknown as string} />
            <BottomSheetTextInput
              style={styles.tagSearchInput}
              placeholder={t('common.search')}
              placeholderTextColor={PlatformColor('placeholderText') as unknown as string}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="default"
              returnKeyType="search"
              textContentType="none"
              clearButtonMode="while-editing"
              accessibilityLabel={t('common.search')}
            />
          </View>
          <BottomSheetScrollView style={styles.tagScrollList} keyboardShouldPersistTaps="handled">
            {canCreate && <Pressable style={styles.tagListRow} onPress={handleCreate} disabled={creating}><Text style={styles.tagListText}>{creating ? t('tags.creating') : t('tags.createTag', { name: trimmedQuery })}</Text></Pressable>}
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
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isSelected }}
                    >
                      <Text style={styles.tagListText}>{tTag(tag.name, t)}</Text>
                      <CheckboxIcon checked={isSelected} />
                    </Pressable>
                  )
                })}
              </View>
            ))}
            {filtered.length === 0 && !canCreate && (
              <Text style={styles.tagEmpty}>{t('tags.noTagsAvailable')}</Text>
            )}
          </BottomSheetScrollView>
      </View>
    </BottomSheetModal>
  )
}

export const IngredientEditor = ({
  value,
  flag,
  activeAllergens,
  onChange,
  onQtyUnitPress,
  onReplace,
  onRestore,
  onRemove,
}: {
  value: StructuredIngredient
  flag: AllergenFlag | null
  activeAllergens: string[]
  onChange: (v: StructuredIngredient) => void
  onQtyUnitPress: () => void
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
  const getQtyUnitButtonStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [styles.ingQtyUnitBtn, pressed && styles.pressedLight],
    [],
  )
  const getAllergenBadgeStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [styles.allergenBadge, pressed && styles.pressedLight],
    [],
  )

  const handleNameChange = useCallback((name: string) => onChange({ ...value, name }), [value, onChange])

  const qtyUnitLabel = [value.qty, value.unit].filter(Boolean).join(' ')
  const qtyUnitAccessibilityLabel = qtyUnitLabel || `${t('units.qtyLabel')} ${t('units.unitLabel')}`
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
        <Pressable
          style={getQtyUnitButtonStyle}
          onPress={onQtyUnitPress}
          hitSlop={10}
          accessibilityLabel={qtyUnitAccessibilityLabel}
        >
          <Text style={[styles.ingQtyUnitText, !qtyUnitLabel && styles.ingPlaceholder]}>
            {qtyUnitLabel || '—'}
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

  sheetBackground: { backgroundColor: PlatformColor('secondarySystemBackground') as unknown as string },
  tagModal: { flex: 1,
    paddingTop: 8,
  },
  tagModalHeader: { alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8 },
  tagModalTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: PlatformColor('label') as unknown as string },
  tagSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 8,
    height: 36,
    borderRadius: 10,
    paddingHorizontal: 10,
    backgroundColor: PlatformColor('systemGray6') as unknown as string,
  },
  tagSearchInput: { flex: 1, paddingVertical: 0, fontSize: 16, color: PlatformColor('label') as unknown as string },
  tagScrollList: { flex: 1 },
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
  tagEmpty: { padding: 16, fontSize: 13, lineHeight: 18, color: PlatformColor('tertiaryLabel') as unknown as string, textAlign: 'center' },

  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: PlatformColor('opaqueSeparator') as unknown as string,
    borderRadius: 2,
  },

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
  ingQtyUnitBtn: {
    borderBottomWidth: 1,
    borderColor: PlatformColor('opaqueSeparator') as unknown as string,
    paddingVertical: 4,
    paddingHorizontal: 4,
    minWidth: 56,
  },
  ingQtyUnitText: { fontSize: 13, lineHeight: 18, color: colors.brand, fontWeight: '600' },
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
