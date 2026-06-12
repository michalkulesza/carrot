import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useRecipes } from '@platekeeper/shared/hooks/useRecipes'
import { useTags } from '@platekeeper/shared/hooks/useTags'
import { useApiClient } from '@platekeeper/shared/api/context'
import { UNITS } from '@platekeeper/shared/types'
import type { Tag } from '@platekeeper/shared/types'
import {
  parseIngredient,
  serializeIngredient,
} from '@platekeeper/shared/utils/ingredientUtils'
import type { StructuredIngredient } from '@platekeeper/shared/utils/ingredientUtils'
import { tTag } from '@platekeeper/shared/utils/tagUtils'
import type { RecipesStackParamList } from '../navigation/RecipesStack'

type Props = NativeStackScreenProps<RecipesStackParamList, 'EditRecipe'>

interface EditComponent {
  name: string
  yield_note: string
  ingredients: StructuredIngredient[]
  steps: string[]
}

interface EditState {
  title: string
  servings: string
  kcal: string
  notes: string
  thumbnail_url: string
  source_url: string
  components: EditComponent[]
}

// ── Unit picker modal ──────────────────────────────────────────────────────────

const UNIT_OPTIONS: string[] = ['', ...UNITS]

const UnitPickerModal = ({
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
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose} />
      <View style={styles.unitSheet}>
        <View style={styles.sheetHandle} />
        <FlatList
          data={UNIT_OPTIONS}
          keyExtractor={(item) => item || '__none__'}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.unitOption, item === selected && styles.unitOptionSel]}
              onPress={() => { onSelect(item); onClose() }}
              accessibilityLabel={item ? t(`units.${item}`) : '—'}
              accessibilityState={{ selected: item === selected }}
            >
              <Text style={[styles.unitOptionText, item === selected && styles.unitOptionTextSel]}>
                {item ? `${item}  ·  ${t(`units.${item}`)}` : '—'}
              </Text>
            </TouchableOpacity>
          )}
          contentContainerStyle={{ paddingBottom: 32 }}
        />
      </View>
    </Modal>
  )
}

// ── Ingredient row editor ──────────────────────────────────────────────────────

const IngredientEditor = ({
  value,
  onUnitPress,
  onChange,
  onRemove,
}: {
  value: StructuredIngredient
  onUnitPress: () => void
  onChange: (v: StructuredIngredient) => void
  onRemove: () => void
}) => {
  const { t } = useTranslation()
  return (
    <View style={styles.ingEditor}>
      <View style={styles.ingRow}>
        <TextInput
          style={styles.ingQty}
          value={value.qty}
          onChangeText={(v) => onChange({ ...value, qty: v })}
          placeholder={t('units.qtyLabel')}
          keyboardType="decimal-pad"
          accessibilityLabel={t('units.qtyLabel')}
        />
        <TouchableOpacity
          style={styles.ingUnitBtn}
          onPress={onUnitPress}
          accessibilityLabel={value.unit ? t(`units.${value.unit}`) : t('units.unitLabel')}
        >
          <Text style={[styles.ingUnitText, !value.unit && styles.ingPlaceholder]}>
            {value.unit || '—'}
          </Text>
        </TouchableOpacity>
        <TextInput
          style={styles.ingName}
          value={value.name}
          onChangeText={(v) => onChange({ ...value, name: v })}
          accessibilityLabel={t('recipes.sectionIngredients')}
        />
        <TouchableOpacity
          onPress={onRemove}
          style={styles.removeBtn}
          accessibilityLabel={t('common.delete')}
          accessibilityRole="button"
        >
          <Text style={styles.removeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.ingNote}
        value={value.note}
        onChangeText={(v) => onChange({ ...value, note: v })}
        placeholder={t('units.noteLabel')}
        accessibilityLabel={t('units.noteLabel')}
      />
    </View>
  )
}

// ── Screen ─────────────────────────────────────────────────────────────────────

const EditRecipeScreen = ({ route, navigation }: Props) => {
  const { recipeId } = route.params
  const { t } = useTranslation()
  const api = useApiClient()
  const qc = useQueryClient()
  const { recipes } = useRecipes()
  const { tags, create: createTagMutation } = useTags()

  const recipe = useMemo(() => recipes.find((r) => r.id === recipeId), [recipes, recipeId])

  const [state, setState] = useState<EditState | null>(null)
  const [selectedTags, setSelectedTags] = useState<Tag[]>([])
  const [saving, setSaving] = useState(false)
  const [unitPickerTarget, setUnitPickerTarget] = useState<{ ci: number; ii: number } | null>(null)

  useEffect(() => {
    if (!recipe || state) return
    setState({
      title: recipe.title,
      servings: recipe.servings?.toString() ?? '',
      kcal: recipe.kcal_per_serving?.toString() ?? '',
      notes: recipe.notes ?? '',
      thumbnail_url: recipe.thumbnail_url ?? '',
      source_url: recipe.source_url ?? '',
      components: recipe.components.map((c) => ({
        name: c.name,
        yield_note: c.yield_note,
        ingredients: (c.ingredients as string[]).map(parseIngredient),
        steps: c.steps,
      })),
    })
    setSelectedTags(recipe.tags)
  }, [recipe, state])

  useEffect(() => {
    if (!state) return
    const unsub = navigation.addListener('beforeRemove', (e) => {
      e.preventDefault()
      Alert.alert(t('addRecipe.discard'), undefined, [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('addRecipe.discard'),
          style: 'destructive',
          onPress: () => navigation.dispatch(e.data.action),
        },
      ])
    })
    return unsub
  }, [navigation, state, t])

  const updateComp = useCallback(
    (ci: number, patch: Partial<EditComponent>) => {
      setState((prev) => {
        if (!prev) return prev
        return { ...prev, components: prev.components.map((c, i) => i === ci ? { ...c, ...patch } : c) }
      })
    },
    [],
  )

  const addIngredient = useCallback((ci: number) => {
    setState((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        components: prev.components.map((c, i) =>
          i === ci ? { ...c, ingredients: [...c.ingredients, { qty: '', unit: '', name: '', note: '' }] } : c,
        ),
      }
    })
  }, [])

  const removeIngredient = useCallback((ci: number, ii: number) => {
    setState((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        components: prev.components.map((c, i) =>
          i === ci ? { ...c, ingredients: c.ingredients.filter((_, j) => j !== ii) } : c,
        ),
      }
    })
  }, [])

  const updateIngredient = useCallback((ci: number, ii: number, val: StructuredIngredient) => {
    setState((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        components: prev.components.map((c, i) =>
          i === ci
            ? { ...c, ingredients: c.ingredients.map((ing, j) => (j === ii ? val : ing)) }
            : c,
        ),
      }
    })
  }, [])

  const addStep = useCallback((ci: number) => {
    setState((prev) => {
      if (!prev) return prev
      return { ...prev, components: prev.components.map((c, i) => i === ci ? { ...c, steps: [...c.steps, ''] } : c) }
    })
  }, [])

  const removeStep = useCallback((ci: number, si: number) => {
    setState((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        components: prev.components.map((c, i) =>
          i === ci ? { ...c, steps: c.steps.filter((_, j) => j !== si) } : c,
        ),
      }
    })
  }, [])

  const updateStep = useCallback((ci: number, si: number, text: string) => {
    setState((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        components: prev.components.map((c, i) =>
          i === ci ? { ...c, steps: c.steps.map((s, j) => (j === si ? text : s)) } : c,
        ),
      }
    })
  }, [])

  const toggleTag = useCallback((tag: Tag) => {
    setSelectedTags((prev) =>
      prev.some((t) => t.id === tag.id) ? prev.filter((t) => t.id !== tag.id) : [...prev, tag],
    )
  }, [])

  const handleSave = useCallback(async () => {
    if (!state) return
    setSaving(true)
    try {
      await api.updateRecipe(recipeId, {
        title: state.title,
        servings: state.servings !== '' ? Number(state.servings) : null,
        kcal_per_serving: state.kcal !== '' ? Number(state.kcal) : null,
        thumbnail_url: state.thumbnail_url || null,
        source_url: state.source_url || null,
        notes: state.notes || null,
        creator_handle: recipe?.creator_handle ?? null,
        components: state.components.map((c) => ({
          name: c.name,
          yield_note: c.yield_note,
          ingredients: c.ingredients.filter((ing) => ing.name).map(serializeIngredient),
          steps: c.steps.filter(Boolean),
          ingredient_flags: [],
          step_ingredient_refs: null,
        })),
        tag_ids: selectedTags.map((tag) => tag.id),
      })
      await qc.invalidateQueries({ queryKey: ['recipes'] })
      navigation.goBack()
    } catch (err) {
      Alert.alert(
        t('common.ok'),
        err instanceof Error ? err.message : t('addRecipe.failedToSave'),
      )
    } finally {
      setSaving(false)
    }
  }, [state, api, recipeId, recipe, selectedTags, qc, navigation, t])

  const pickedIngredient = unitPickerTarget
    ? state?.components[unitPickerTarget.ci]?.ingredients[unitPickerTarget.ii]
    : null

  if (!recipe || !state) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{t('common.loading')}</Text>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={88}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Title */}
        <Text style={styles.fieldLabel}>{t('recipes.colTitle')}</Text>
        <TextInput
          style={styles.input}
          value={state.title}
          onChangeText={(v) => setState((s) => s && { ...s, title: v })}
          accessibilityLabel={t('recipes.colTitle')}
        />

        {/* Meta */}
        <View style={styles.row}>
          <View style={styles.halfField}>
            <Text style={styles.fieldLabel}>{t('recipes.serves')}</Text>
            <TextInput
              style={styles.input}
              value={state.servings}
              onChangeText={(v) => setState((s) => s && { ...s, servings: v })}
              keyboardType="numeric"
              accessibilityLabel={t('recipes.serves')}
            />
          </View>
          <View style={styles.halfField}>
            <Text style={styles.fieldLabel}>{t('recipes.kcalPerServing')}</Text>
            <TextInput
              style={styles.input}
              value={state.kcal}
              onChangeText={(v) => setState((s) => s && { ...s, kcal: v })}
              keyboardType="numeric"
              accessibilityLabel={t('recipes.kcalPerServing')}
            />
          </View>
        </View>

        {/* Thumbnail */}
        <Text style={styles.fieldLabel}>{t('common.thumbnail')}</Text>
        <TextInput
          style={styles.input}
          value={state.thumbnail_url}
          onChangeText={(v) => setState((s) => s && { ...s, thumbnail_url: v })}
          autoCapitalize="none"
          keyboardType="url"
          placeholder="https://…"
          accessibilityLabel={t('common.thumbnail')}
        />

        {/* Notes */}
        <Text style={styles.fieldLabel}>{t('recipes.notes')}</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={state.notes}
          onChangeText={(v) => setState((s) => s && { ...s, notes: v })}
          multiline
          numberOfLines={3}
          placeholder={t('common.addPrivateNotes')}
          accessibilityLabel={t('recipes.notes')}
        />

        {/* Tags */}
        <Text style={styles.fieldLabel}>{t('tags.tags')}</Text>
        <View style={styles.tagCloud}>
          {tags.map((tag) => {
            const sel = selectedTags.some((t) => t.id === tag.id)
            return (
              <TouchableOpacity
                key={tag.id}
                style={[styles.tagChip, sel && styles.tagChipSel]}
                onPress={() => toggleTag(tag)}
                accessibilityLabel={tag.name}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: sel }}
              >
                <Text style={[styles.tagChipText, sel && styles.tagChipTextSel]}>{tTag(tag.name, t)}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {/* Components */}
        {state.components.map((comp, ci) => (
          <View key={ci} style={styles.componentBlock}>
            <Text style={styles.componentHeader}>
              {state.components.length > 1
                ? comp.name || `${t('recipes.sectionIngredients')} ${ci + 1}`
                : t('recipes.sectionIngredients')}
            </Text>
            {state.components.length > 1 && (
              <>
                <Text style={styles.fieldLabel}>{t('settings.nameLabel')}</Text>
                <TextInput
                  style={styles.input}
                  value={comp.name}
                  onChangeText={(v) => updateComp(ci, { name: v })}
                  accessibilityLabel={t('settings.nameLabel')}
                />
              </>
            )}

            {/* Ingredients */}
            <Text style={styles.subLabel}>{t('recipes.sectionIngredients')}</Text>
            {comp.ingredients.map((ing, ii) => (
              <IngredientEditor
                key={ii}
                value={ing}
                onUnitPress={() => setUnitPickerTarget({ ci, ii })}
                onChange={(val) => updateIngredient(ci, ii, val)}
                onRemove={() => removeIngredient(ci, ii)}
              />
            ))}
            <TouchableOpacity
              style={styles.addRowBtn}
              onPress={() => addIngredient(ci)}
              accessibilityLabel={t('common.add')}
              accessibilityRole="button"
            >
              <Text style={styles.addRowBtnText}>+ {t('addRecipe.addIngredient')}</Text>
            </TouchableOpacity>

            {/* Steps */}
            <Text style={styles.subLabel}>{t('recipes.steps')}</Text>
            {comp.steps.map((step, si) => (
              <View key={si} style={styles.listRow}>
                <Text style={styles.stepNum}>{si + 1}.</Text>
                <TextInput
                  style={[styles.listInput, styles.multiline]}
                  value={step}
                  onChangeText={(v) => updateStep(ci, si, v)}
                  multiline
                  placeholder={`${t('recipes.steps')} ${si + 1}`}
                  accessibilityLabel={`${t('recipes.steps')} ${si + 1}`}
                />
                <TouchableOpacity
                  onPress={() => removeStep(ci, si)}
                  style={styles.removeBtn}
                  accessibilityLabel={t('common.delete')}
                  accessibilityRole="button"
                >
                  <Text style={styles.removeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity
              style={styles.addRowBtn}
              onPress={() => addStep(ci)}
              accessibilityLabel={t('common.add')}
              accessibilityRole="button"
            >
              <Text style={styles.addRowBtnText}>+ {t('addRecipe.addStep')}</Text>
            </TouchableOpacity>
          </View>
        ))}

        {/* Save */}
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
          accessibilityLabel={t('common.save')}
          accessibilityRole="button"
        >
          <Text style={styles.saveBtnText}>
            {saving ? t('common.saving') : t('common.save')}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <UnitPickerModal
        visible={unitPickerTarget !== null}
        selected={pickedIngredient?.unit ?? ''}
        onSelect={(u) => {
          if (!unitPickerTarget) return
          const ing = state.components[unitPickerTarget.ci]?.ingredients[unitPickerTarget.ii]
          if (ing) updateIngredient(unitPickerTarget.ci, unitPickerTarget.ii, { ...ing, unit: u })
        }}
        onClose={() => setUnitPickerTarget(null)}
      />
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { color: '#9ca3af', fontSize: 15 },
  content: { padding: 16, paddingBottom: 48 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 16,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111',
    backgroundColor: '#fafafa',
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 12 },
  halfField: { flex: 1 },
  tagCloud: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  tagChip: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f9fafb',
  },
  tagChipSel: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  tagChipText: { fontSize: 13, color: '#374151' },
  tagChipTextSel: { color: '#fff', fontWeight: '600' },
  componentBlock: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  componentHeader: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 4 },
  subLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 14,
    marginBottom: 6,
  },
  listRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 6 },
  listInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: '#111',
    backgroundColor: '#fafafa',
  },
  stepNum: {
    width: 24,
    fontSize: 14,
    fontWeight: '700',
    color: '#2563eb',
    textAlign: 'right',
    marginTop: 2,
  },
  removeBtn: { padding: 4 },
  removeBtnText: { fontSize: 14, color: '#9ca3af' },
  addRowBtn: { paddingVertical: 8 },
  addRowBtnText: { fontSize: 14, color: '#2563eb', fontWeight: '500' },
  saveBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  // Unit picker modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  unitSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
    maxHeight: '60%',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#e5e7eb',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 8,
  },
  unitOption: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#f3f4f6',
  },
  unitOptionSel: { backgroundColor: '#f5f3ff' },
  unitOptionText: { fontSize: 15, color: '#374151' },
  unitOptionTextSel: { color: '#7c3aed', fontWeight: '600' },
  // Ingredient editor
  ingEditor: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#f3f4f6',
    gap: 4,
  },
  ingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ingQty: {
    width: 44,
    borderBottomWidth: 1,
    borderColor: '#e5e7eb',
    fontSize: 14,
    color: '#111',
    textAlign: 'center',
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  ingUnitBtn: {
    borderBottomWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 2,
    paddingHorizontal: 4,
    minWidth: 36,
  },
  ingUnitText: { fontSize: 13, color: '#7c3aed', fontWeight: '500' },
  ingPlaceholder: { color: '#9ca3af' },
  ingName: {
    flex: 1,
    borderBottomWidth: 1,
    borderColor: '#e5e7eb',
    fontSize: 14,
    color: '#111',
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  ingNote: {
    fontSize: 12,
    color: '#9ca3af',
    borderBottomWidth: 1,
    borderColor: '#f3f4f6',
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
})

export default EditRecipeScreen
