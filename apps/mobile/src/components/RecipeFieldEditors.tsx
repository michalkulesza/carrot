import { useMemo, useState } from 'react'
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
import { UNITS } from '@platekeeper/shared/types'
import type { AllergenFlag, Tag } from '@platekeeper/shared/types'
import type { StructuredIngredient } from '@platekeeper/shared/utils/ingredientUtils'
import { tTag } from '@platekeeper/shared/utils/tagUtils'
import { colors } from '../theme/colors'

// Shared editing controls used by both the import flow and in-place recipe
// editing, so the two look and behave identically.

export const UNIT_OPTIONS: string[] = ['', ...UNITS]

// ── UnitPickerModal ──────────────────────────────────────────────────────────

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
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose} />
      <View style={styles.unitSheet}>
        <View style={styles.sheetHandle} />
        <FlatList
          data={UNIT_OPTIONS}
          keyExtractor={(item) => item || '__none__'}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.unitOption, item === selected && styles.unitOptionSel, pressed && { opacity: 0.7 }]}
              onPress={() => { onSelect(item); onClose() }}
              accessibilityLabel={item ? t(`units.${item}`) : '—'}
              accessibilityState={{ selected: item === selected }}
            >
              <Text style={[styles.unitOptionText, item === selected && styles.unitOptionTextSel]}>
                {item ? `${item}  ·  ${t(`units.${item}`)}` : '—'}
              </Text>
            </Pressable>
          )}
          contentContainerStyle={{ paddingBottom: 32 }}
        />
      </View>
    </Modal>
  )
}

// ── TagPickerModal ─────────────────────────────────────────────────────────────

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return allTags.filter((tag) => !q || tag.name.toLowerCase().includes(q))
  }, [allTags, query])

  const exactMatch = allTags.some((tag) => tag.name.toLowerCase() === query.trim().toLowerCase())
  const canCreate = query.trim().length > 0 && !exactMatch

  const handleCreate = async () => {
    const name = query.trim()
    if (!name) return
    setCreating(true)
    try {
      const tag = await onCreate(name)
      onAdd(tag)
      setQuery('')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.tagModalWrap}>
        <View style={styles.tagModal}>
          <View style={styles.sheetHandle} />
          <View style={styles.tagModalHeader}>
            <Text style={styles.tagModalTitle}>{t('tags.addTag')}</Text>
            <Pressable style={({ pressed }) => [pressed && { opacity: 0.7 }]} onPress={onClose} accessibilityLabel={t('common.close')}>
              <Text style={styles.tagModalClose}>✕</Text>
            </Pressable>
          </View>
          <TextInput
            style={styles.tagSearch}
            placeholder={t('tags.searchOrCreate')}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            accessibilityLabel={t('tags.searchOrCreate')}
          />
          <ScrollView style={styles.tagScrollList} keyboardShouldPersistTaps="handled">
            {canCreate && (
              <Pressable
                style={({ pressed }) => [styles.tagCreateRow, pressed && { opacity: 0.7 }]}
                onPress={handleCreate}
                disabled={creating}
                accessibilityLabel={t('tags.createTag', { name: query.trim() })}
              >
                <Text style={styles.tagCreateText}>
                  {creating ? t('tags.creating') : t('tags.createTag', { name: query.trim() })}
                </Text>
              </Pressable>
            )}
            {filtered.map((tag) => {
              const isSel = selectedIds.has(tag.id)
              return (
                <Pressable
                  key={tag.id}
                  style={({ pressed }) => [styles.tagListRow, pressed && { opacity: 0.7 }]}
                  onPress={() => (isSel ? onRemove(tag.id) : onAdd(tag))}
                  accessibilityLabel={tag.name}
                  accessibilityState={{ selected: isSel }}
                >
                  <Text style={styles.tagListText}>{tTag(tag.name, t)}</Text>
                  {isSel && <Text style={styles.tagCheck}>✓</Text>}
                </Pressable>
              )
            })}
            {filtered.length === 0 && !canCreate && (
              <Text style={styles.tagEmpty}>{t('tags.noTagsAvailable')}</Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

// ── IngredientEditor ───────────────────────────────────────────────────────────

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

  const handleAllergenPress = () => {
    if (!flag?.allergen) return
    const title = `${t('recipes.contains')}: ${flag.allergen}`
    if (flag.substitute_applied && flag.original_display) {
      Alert.alert(title, `${t('recipes.originally')} ${flag.original_display}, ${t('recipes.replacedWith')} ${flag.substitute} ${t('recipes.dueTo')} ${flag.allergen}.`, [
        { text: t('recipes.restoreOriginal'), onPress: onRestore },
        { text: t('common.cancel'), style: 'cancel' },
      ])
    } else if (flag.substitute) {
      Alert.alert(title, `${t('recipes.suggestedSubstitute')} ${flag.substitute}`, [
        { text: t('recipes.replace'), onPress: onReplace },
        { text: t('recipes.keepOriginal'), style: 'cancel' },
      ])
    } else {
      Alert.alert(title, t('recipes.noSubstituteAvailable'))
    }
  }

  return (
    <View style={styles.ingEditor}>
      <View style={styles.ingRow}>
        {onRemove && (
          <Pressable
            style={({ pressed }) => [styles.ingRemoveBtn, pressed && { opacity: 0.6 }]}
            onPress={onRemove}
            hitSlop={8}
            accessibilityLabel={t('addRecipe.removeIngredient')}
          >
            <Text style={styles.ingRemoveText}>−</Text>
          </Pressable>
        )}
        <TextInput
          style={styles.ingQty}
          value={value.qty}
          onChangeText={(v) => onChange({ ...value, qty: v })}
          placeholder={t('units.qtyLabel')}
          keyboardType="decimal-pad"
          accessibilityLabel={t('units.qtyLabel')}
        />
        <Pressable
          style={({ pressed }) => [styles.ingUnitBtn, pressed && { opacity: 0.7 }]}
          onPress={onUnitPress}
          accessibilityLabel={value.unit ? t(`units.${value.unit}`) : t('units.unitLabel')}
        >
          <Text style={[styles.ingUnitText, !value.unit && styles.ingPlaceholder]}>
            {value.unit || '—'}
          </Text>
        </Pressable>
        <TextInput
          style={styles.ingName}
          value={value.name}
          onChangeText={(v) => onChange({ ...value, name: v })}
          accessibilityLabel="ingredient name"
        />
        {isAllergenActive && (
          <Pressable
            style={({ pressed }) => [styles.allergenBadge, pressed && { opacity: 0.7 }]}
            onPress={handleAllergenPress}
            accessibilityLabel={`${t('recipes.contains')} ${flag!.allergen}`}
          >
            <Text style={styles.allergenText}>⚠ {flag!.allergen}</Text>
          </Pressable>
        )}
      </View>
      <TextInput
        style={[styles.ingNote, onRemove && styles.ingNoteWithRemove]}
        value={value.note}
        onChangeText={(v) => onChange({ ...value, note: v })}
        placeholder={t('units.noteLabel')}
        accessibilityLabel={t('units.noteLabel')}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  // Tag picker modal
  tagModalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  tagModal: {
    backgroundColor: PlatformColor('systemBackground') as unknown as string,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
    maxHeight: '72%',
    paddingBottom: 24,
  },
  tagModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8 },
  tagModalTitle: { fontSize: 16, fontWeight: '700', color: PlatformColor('label') as unknown as string },
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
  tagEmpty: { padding: 16, fontSize: 13, color: PlatformColor('tertiaryLabel') as unknown as string, textAlign: 'center' },

  // Unit picker sheet
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  unitSheet: {
    backgroundColor: PlatformColor('systemBackground') as unknown as string,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
    maxHeight: '60%',
  },
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

  // Ingredient editor
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
  ingUnitText: { fontSize: 13, color: colors.brand, fontWeight: '500' },
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
  allergenText: { fontSize: 10, color: '#92400e', fontWeight: '600' },
  ingNote: {
    fontSize: 12,
    color: PlatformColor('tertiaryLabel') as unknown as string,
    borderBottomWidth: 1,
    borderColor: PlatformColor('separator') as unknown as string,
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontStyle: 'italic',
    marginLeft: 52,
  },
  ingNoteWithRemove: { marginLeft: 80 },
})
