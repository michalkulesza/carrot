import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import * as Clipboard from 'expo-clipboard'
import { useQueryClient } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useApiClient } from '@platekeeper/shared/api/context'
import { useTags } from '@platekeeper/shared/hooks/useTags'
import { usePreferences } from '@platekeeper/shared/hooks/usePreferences'
import { UNITS } from '@platekeeper/shared/types'
import type {
  AllergenFlag,
  ImportResult,
  RecipeComponent,
  StageEvent,
  StepIngredientRef,
  Tag,
} from '@platekeeper/shared/types'
import {
  parseIngredient,
  serializeIngredient,
} from '@platekeeper/shared/utils/ingredientUtils'
import type { StructuredIngredient } from '@platekeeper/shared/utils/ingredientUtils'
import { tTag } from '@platekeeper/shared/utils/tagUtils'
import type { RecipesStackParamList } from '../navigation/RecipesStack'
import { colors } from '../theme/colors'

type Props = NativeStackScreenProps<RecipesStackParamList, 'ImportRecipe'>

// ── Local types ────────────────────────────────────────────────────────────────

interface StepState extends StageEvent {
  status: 'active' | 'done'
}

interface EditableComponent {
  name: string
  yield_note: string
  ingredients: StructuredIngredient[]
  steps: string[]
  ingredient_flags: (AllergenFlag | null)[]
  step_ingredient_refs: StepIngredientRef[][] | null
}

interface EditableRecipe {
  title: string
  servings: string
  kcal: string
  thumbnail_url: string | null
  creator_handle: string | null
  source_url: string | null
  components: EditableComponent[]
  suggestedTagNames: string[]
}

// ── Pure helpers ───────────────────────────────────────────────────────────────

const toEditable = (result: ImportResult, autoSubstitute: boolean): EditableRecipe => {
  const { recipe, metadata } = result
  return {
    title: recipe?.title ?? '',
    servings: recipe?.servings?.toString() ?? '',
    kcal: recipe?.kcal_per_serving?.toString() ?? '',
    thumbnail_url: metadata.thumbnail_url,
    creator_handle: metadata.creator_handle,
    source_url: metadata.source_url || null,
    suggestedTagNames: recipe?.tags ?? [],
    components: (recipe?.components ?? []).map((c: RecipeComponent) => {
      const stepCount = c.steps.length
      let step_ingredient_refs: StepIngredientRef[][] | null = null
      if (c.step_refs && c.step_refs.length > 0) {
        const arr: StepIngredientRef[][] = Array.from({ length: stepCount }, () => [])
        for (const ref of c.step_refs) {
          if (ref.step_index < stepCount) {
            arr[ref.step_index].push({ ingredient_index: ref.ingredient_index, mention: ref.mention })
          }
        }
        step_ingredient_refs = arr
      }
      return {
        name: c.name ?? c.role,
        yield_note: c.yield_note ?? '',
        ingredients: c.ingredients.map((ing) => {
          const useSub = autoSubstitute && !!ing.allergen && !!ing.substitute
          const nameToUse = useSub ? ing.substitute! : ing.name
          if (!ing.qty) {
            return parseIngredient(
              [nameToUse, ing.note ? `(${ing.note})` : ''].filter(Boolean).join(' '),
            )
          }
          return { qty: ing.qty ?? '', unit: ing.unit ?? '', name: nameToUse, note: ing.note ?? '' }
        }),
        steps: c.steps,
        ingredient_flags: c.ingredients.map((ing) => ({
          allergen: ing.allergen ?? null,
          substitute: ing.substitute ?? null,
          substitute_applied: autoSubstitute && !!ing.allergen && !!ing.substitute,
          original_display: null,
          ingredient_name: ing.name,
        })),
        step_ingredient_refs,
      }
    }),
  }
}

// ── UnitPickerModal ────────────────────────────────────────────────────────────

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
      <Pressable style={styles.modalOverlay} onPress={onClose} />
      <View style={styles.unitSheet}>
        <View style={styles.sheetHandle} />
        <FlatList
          data={UNIT_OPTIONS}
          keyExtractor={(item) => item || '__none__'}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.unitOption, item === selected && styles.unitOptionSel, pressed && { opacity: 0.7 }]}
              onPress={() => {
                onSelect(item)
                onClose()
              }}
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

const TagPickerModal = ({
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

  const exactMatch = allTags.some(
    (tag) => tag.name.toLowerCase() === query.trim().toLowerCase(),
  )
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
                  {creating
                    ? t('tags.creating')
                    : t('tags.createTag', { name: query.trim() })}
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

const IngredientEditor = ({
  value,
  flag,
  activeAllergens,
  onChange,
  onUnitPress,
  onReplace,
  onRestore,
}: {
  value: StructuredIngredient
  flag: AllergenFlag | null
  activeAllergens: string[]
  onChange: (v: StructuredIngredient) => void
  onUnitPress: () => void
  onReplace: () => void
  onRestore: () => void
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
      Alert.alert(
        title,
        `${t('recipes.originally')} ${flag.original_display}, ${t('recipes.replacedWith')} ${flag.substitute} ${t('recipes.dueTo')} ${flag.allergen}.`,
        [
          { text: t('recipes.restoreOriginal'), onPress: onRestore },
          { text: t('common.cancel'), style: 'cancel' },
        ],
      )
    } else if (flag.substitute) {
      Alert.alert(
        title,
        `${t('recipes.suggestedSubstitute')} ${flag.substitute}`,
        [
          { text: t('recipes.replace'), onPress: onReplace },
          { text: t('recipes.keepOriginal'), style: 'cancel' },
        ],
      )
    } else {
      Alert.alert(title, t('recipes.noSubstituteAvailable'))
    }
  }

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
        style={styles.ingNote}
        value={value.note}
        onChangeText={(v) => onChange({ ...value, note: v })}
        placeholder={t('units.noteLabel')}
        accessibilityLabel={t('units.noteLabel')}
      />
    </View>
  )
}

// ── EditableRecipeView ─────────────────────────────────────────────────────────

const EditableRecipeView = ({
  recipe,
  onChange,
  selectedTags,
  selectedTagIds,
  allTags,
  onTagAdd,
  onTagRemove,
  onTagCreate,
  activeAllergens,
}: {
  recipe: EditableRecipe
  onChange: (r: EditableRecipe) => void
  selectedTags: Tag[]
  selectedTagIds: Set<string>
  allTags: Tag[]
  onTagAdd: (tag: Tag) => void
  onTagRemove: (tagId: string) => void
  onTagCreate: (name: string) => Promise<Tag>
  activeAllergens: string[]
}) => {
  const { t } = useTranslation()
  const [unitPickerTarget, setUnitPickerTarget] = useState<{ ci: number; ii: number } | null>(null)
  const [showTagPicker, setShowTagPicker] = useState(false)
  const [showImgEdit, setShowImgEdit] = useState(false)
  const [imgDraft, setImgDraft] = useState('')

  const handleReplaceAllergen = (ci: number, ii: number) => {
    const comp = recipe.components[ci]
    const flag = comp.ingredient_flags[ii]
    if (!flag?.substitute) return
    const originalDisplay = serializeIngredient(comp.ingredients[ii])
    const components = recipe.components.map((c, ci2) =>
      ci2 !== ci
        ? c
        : {
            ...c,
            ingredients: c.ingredients.map((ing, idx) =>
              idx === ii ? parseIngredient(flag.substitute!) : ing,
            ),
            ingredient_flags: c.ingredient_flags.map((f, idx) =>
              idx === ii ? { ...f!, substitute_applied: true, original_display: originalDisplay } : f,
            ),
          },
    )
    onChange({ ...recipe, components })
  }

  const handleRestoreAllergen = (ci: number, ii: number) => {
    const comp = recipe.components[ci]
    const flag = comp.ingredient_flags[ii]
    if (!flag?.original_display) return
    const components = recipe.components.map((c, ci2) =>
      ci2 !== ci
        ? c
        : {
            ...c,
            ingredients: c.ingredients.map((ing, idx) =>
              idx === ii ? parseIngredient(flag.original_display!) : ing,
            ),
            ingredient_flags: c.ingredient_flags.map((f, idx) =>
              idx === ii ? { ...f!, substitute_applied: false, original_display: null } : f,
            ),
          },
    )
    onChange({ ...recipe, components })
  }

  const setIngredient = (ci: number, ii: number, val: StructuredIngredient) => {
    onChange({
      ...recipe,
      components: recipe.components.map((c, ci2) =>
        ci2 !== ci
          ? c
          : { ...c, ingredients: c.ingredients.map((ing, ii2) => (ii2 === ii ? val : ing)) },
      ),
    })
  }

  const setStep = (ci: number, si: number, val: string) => {
    onChange({
      ...recipe,
      components: recipe.components.map((c, ci2) =>
        ci2 !== ci ? c : { ...c, steps: c.steps.map((s, si2) => (si2 === si ? val : s)) },
      ),
    })
  }

  const currentUnit =
    unitPickerTarget != null
      ? (recipe.components[unitPickerTarget.ci]?.ingredients[unitPickerTarget.ii]?.unit ?? '')
      : ''

  return (
    <View style={styles.editView}>
      {/* Thumbnail + title */}
      <View style={styles.titleRow}>
        <Pressable
          style={({ pressed }) => [styles.thumbBtn, pressed && { opacity: 0.7 }]}
          onPress={() => {
            setImgDraft(recipe.thumbnail_url ?? '')
            setShowImgEdit(true)
          }}
          accessibilityLabel={t('common.thumbnail')}
        >
          {recipe.thumbnail_url ? (
            <Image
              source={{ uri: recipe.thumbnail_url }}
              style={styles.thumbImg}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.thumbPlaceholder}>
              <Text style={styles.thumbIcon}>🖼</Text>
            </View>
          )}
          <View style={styles.thumbEditBadge}>
            <Text style={styles.thumbEditText}>{t('common.edit')}</Text>
          </View>
        </Pressable>

        <TextInput
          style={styles.titleInput}
          value={recipe.title}
          onChangeText={(v) => onChange({ ...recipe, title: v })}
          multiline
          accessibilityLabel="recipe title"
        />
      </View>

      {/* Image URL edit modal */}
      <Modal
        visible={showImgEdit}
        transparent
        animationType="fade"
        onRequestClose={() => setShowImgEdit(false)}
      >
        <View style={styles.imgEditOverlay}>
          <View style={styles.imgEditBox}>
            <Text style={styles.imgEditTitle}>{t('common.imageUrl')}</Text>
            <TextInput
              style={styles.imgEditInput}
              value={imgDraft}
              onChangeText={setImgDraft}
              placeholder="https://..."
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              autoFocus
              accessibilityLabel={t('common.imageUrl')}
            />
            <View style={styles.imgEditActions}>
              <Pressable
                style={({ pressed }) => [styles.imgCancelBtn, pressed && { opacity: 0.7 }]}
                onPress={() => setShowImgEdit(false)}
                accessibilityLabel={t('common.cancel')}
              >
                <Text style={styles.imgCancelText}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.imgSaveBtn, pressed && { opacity: 0.7 }]}
                onPress={() => {
                  onChange({ ...recipe, thumbnail_url: imgDraft.trim() || null })
                  setShowImgEdit(false)
                }}
                accessibilityLabel={t('common.save')}
              >
                <Text style={styles.imgSaveText}>{t('common.save')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Servings + kcal pills */}
      <View style={styles.metaRow}>
        {recipe.servings !== '' && (
          <View style={styles.servingsPill}>
            <Text style={styles.servingsLabel}>{t('recipes.serves')}</Text>
            <TextInput
              style={styles.servingsInput}
              value={recipe.servings}
              onChangeText={(v) => onChange({ ...recipe, servings: v })}
              keyboardType="number-pad"
              accessibilityLabel={t('recipes.serves')}
            />
          </View>
        )}
        {recipe.kcal !== '' && (
          <View style={styles.kcalPill}>
            <TextInput
              style={styles.kcalInput}
              value={recipe.kcal}
              onChangeText={(v) => onChange({ ...recipe, kcal: v })}
              keyboardType="number-pad"
              accessibilityLabel={t('recipes.kcalPerServing')}
            />
            <Text style={styles.kcalLabel}>{t('recipes.kcalPerServing')}</Text>
          </View>
        )}
      </View>

      {/* Creator / source */}
      {(recipe.creator_handle || recipe.source_url) && (
        <View style={styles.sourceRow}>
          {recipe.creator_handle ? (
            <Text style={styles.sourcePill}>
              {t('addRecipe.by', { handle: recipe.creator_handle })}
            </Text>
          ) : null}
          {recipe.source_url ? (
            <Text style={styles.sourcePill} numberOfLines={1}>
              {recipe.source_url}
            </Text>
          ) : null}
        </View>
      )}

      {/* Tags */}
      <View style={styles.tagsSection}>
        <View style={styles.tagsRow}>
          {selectedTags.map((tag) => (
            <Pressable
              key={tag.id}
              style={({ pressed }) => [styles.tagChip, pressed && { opacity: 0.7 }]}
              onPress={() => onTagRemove(tag.id)}
              accessibilityLabel={`${tag.name}, tap to remove`}
            >
              <Text style={styles.tagChipText}>{tTag(tag.name, t)} ×</Text>
            </Pressable>
          ))}
          <Pressable
            style={({ pressed }) => [styles.addTagBtn, pressed && { opacity: 0.7 }]}
            onPress={() => setShowTagPicker(true)}
            accessibilityLabel={t('tags.addTag')}
          >
            <Text style={styles.addTagBtnText}>+ {t('tags.addTag')}</Text>
          </Pressable>
        </View>
      </View>

      <TagPickerModal
        visible={showTagPicker}
        allTags={allTags}
        selectedIds={selectedTagIds}
        onAdd={onTagAdd}
        onRemove={onTagRemove}
        onCreate={onTagCreate}
        onClose={() => setShowTagPicker(false)}
      />

      <UnitPickerModal
        visible={unitPickerTarget != null}
        selected={currentUnit}
        onSelect={(unit) => {
          if (unitPickerTarget == null) return
          setIngredient(unitPickerTarget.ci, unitPickerTarget.ii, {
            ...recipe.components[unitPickerTarget.ci].ingredients[unitPickerTarget.ii],
            unit,
          })
        }}
        onClose={() => setUnitPickerTarget(null)}
      />

      {/* Recipe components */}
      {recipe.components.map((comp, ci) => (
        <View key={ci} style={styles.componentBlock}>
          {recipe.components.length > 1 && (
            <Text style={styles.componentTitle}>{comp.name}</Text>
          )}

          {comp.ingredients.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>{t('recipes.sectionIngredients')}</Text>
              {comp.ingredients.map((ing, ii) => (
                <IngredientEditor
                  key={ii}
                  value={ing}
                  flag={comp.ingredient_flags[ii] ?? null}
                  activeAllergens={activeAllergens}
                  onChange={(v) => setIngredient(ci, ii, v)}
                  onUnitPress={() => setUnitPickerTarget({ ci, ii })}
                  onReplace={() => handleReplaceAllergen(ci, ii)}
                  onRestore={() => handleRestoreAllergen(ci, ii)}
                />
              ))}
            </View>
          )}

          {comp.steps.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>{t('recipes.steps')}</Text>
              {comp.steps.map((step, si) => (
                <View key={si} style={styles.stepRow}>
                  <Text style={styles.stepNum}>{si + 1}.</Text>
                  <TextInput
                    style={styles.stepInput}
                    value={step}
                    onChangeText={(v) => setStep(ci, si, v)}
                    multiline
                    accessibilityLabel={`${t('common.step')} ${si + 1}`}
                  />
                </View>
              ))}
            </View>
          )}
        </View>
      ))}
    </View>
  )
}

// ── ImportRecipeScreen ─────────────────────────────────────────────────────────

const ImportRecipeScreen = ({ navigation }: Props) => {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const api = useApiClient()
  const qc = useQueryClient()
  const { tags, create: createTagMutation } = useTags()
  const { preferences } = usePreferences()

  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [progressSteps, setProgressSteps] = useState<StepState[]>([])
  const [editable, setEditable] = useState<EditableRecipe | null>(null)
  const [selectedTags, setSelectedTags] = useState<Tag[]>([])
  const [error, setError] = useState<string | null>(null)
  const cancelRef = useRef<(() => void) | null>(null)

  const activeAllergens = useMemo(() => {
    const p = preferences?.personal_allergens
    return p ? [...(p.predefined ?? []), ...(p.custom ?? [])] : []
  }, [preferences])

  const autoSubstitute = preferences?.auto_substitute ?? false

  useEffect(() => () => { cancelRef.current?.() }, [])

  useEffect(() => {
    if (!editable) return
    const unsub = navigation.addListener('beforeRemove', (e) => {
      e.preventDefault()
      Alert.alert(
        t('addRecipe.discard'),
        undefined,
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('addRecipe.discard'),
            style: 'destructive',
            onPress: () => navigation.dispatch(e.data.action),
          },
        ],
      )
    })
    return unsub
  }, [navigation, editable, t])

  useLayoutEffect(() => {
    navigation.setOptions({
      title: editable ? t('addRecipe.editRecipe') : t('addRecipe.importRecipe'),
    })
  }, [navigation, editable, t])

  const handlePaste = async () => {
    const text = await Clipboard.getStringAsync()
    if (text) setUrl(text.trim())
  }

  const reset = () => {
    cancelRef.current?.()
    setLoading(false)
    setProgressSteps([])
    setEditable(null)
    setSelectedTags([])
    setError(null)
  }

  const handleImport = () => {
    if (!url.trim()) return
    cancelRef.current?.()
    setLoading(true)
    setError(null)
    setEditable(null)
    setSelectedTags([])
    setProgressSteps([])

    cancelRef.current = api.streamImportFetch(url.trim(), {
      onStage(stage) {
        setProgressSteps((prev) => [
          ...prev.map((s) => (s.status === 'active' ? { ...s, status: 'done' as const } : s)),
          { ...stage, status: 'active' },
        ])
      },
      onDone(res) {
        setProgressSteps((prev) =>
          prev.map((s) => (s.status === 'active' ? { ...s, status: 'done' as const } : s)),
        )
        if (res.recipe) {
          const editableRecipe = toEditable(res, autoSubstitute)
          setEditable(editableRecipe)
          setSelectedTags(
            tags.filter((tag) =>
              editableRecipe.suggestedTagNames.some(
                (name) => name.toLowerCase() === tag.name.toLowerCase(),
              ),
            ),
          )
        } else {
          setError(res.error ?? t('addRecipe.importFailed'))
        }
        setLoading(false)
      },
      onError(msg) {
        setError(msg)
        setLoading(false)
      },
    })
  }

  const handleSave = async () => {
    if (!editable) return
    setSaving(true)
    setError(null)
    try {
      await api.saveRecipe({
        title: editable.title,
        servings: editable.servings !== '' ? Number(editable.servings) : null,
        kcal_per_serving: editable.kcal !== '' ? Number(editable.kcal) : null,
        thumbnail_url: editable.thumbnail_url,
        creator_handle: editable.creator_handle,
        source_url: editable.source_url,
        components: editable.components.map((c) => ({
          name: c.name,
          yield_note: c.yield_note,
          ingredients: c.ingredients.map(serializeIngredient),
          steps: c.steps,
          ingredient_flags: c.ingredient_flags.map(
            (f) =>
              f ?? {
                allergen: null,
                substitute: null,
                substitute_applied: false,
                original_display: null,
              },
          ),
          step_ingredient_refs: c.step_ingredient_refs,
        })),
        tag_ids: selectedTags.map((tag) => tag.id),
      })
      await qc.invalidateQueries({ queryKey: ['recipes'] })
      navigation.goBack()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('addRecipe.failedToSave'))
    } finally {
      setSaving(false)
    }
  }

  const handleTagCreate = useCallback(
    async (name: string): Promise<Tag> => createTagMutation.mutateAsync(name),
    [createTagMutation],
  )

  const handleTagAdd = useCallback(
    (tag: Tag) => setSelectedTags((prev) => [...prev, tag]),
    [],
  )

  const handleTagRemove = useCallback(
    (id: string) => setSelectedTags((prev) => prev.filter((tag) => tag.id !== id)),
    [],
  )

  const selectedTagIds = useMemo(
    () => new Set(selectedTags.map((tag) => tag.id)),
    [selectedTags],
  )

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={88}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* URL input phase */}
        {!editable && (
          <View style={styles.urlSection}>
            <Text style={styles.urlLabel}>{t('addRecipe.recipeUrl')}</Text>
            <View style={styles.urlRow}>
              <TextInput
                style={styles.urlInput}
                value={url}
                onChangeText={setUrl}
                placeholder={t('addRecipe.urlPlaceholder')}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                editable={!loading}
                returnKeyType="go"
                onSubmitEditing={handleImport}
                accessibilityLabel={t('addRecipe.recipeUrl')}
              />
              <Pressable
                style={({ pressed }) => [styles.pasteBtn, pressed && { opacity: 0.7 }]}
                onPress={handlePaste}
                disabled={loading}
                accessibilityLabel={t('addRecipe.paste')}
              >
                <Text style={styles.pasteBtnText}>{t('addRecipe.paste')}</Text>
              </Pressable>
            </View>

            {progressSteps.length > 0 && (
              <View style={styles.progressList}>
                {progressSteps.map((s) => (
                  <View key={s.key} style={styles.progressRow}>
                    <Text style={styles.progressIcon}>{s.status === 'done' ? '✓' : '⋯'}</Text>
                    <Text
                      style={[styles.progressLabel, s.status === 'active' && styles.progressActive]}
                    >
                      {s.label}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {loading && (
              <ActivityIndicator
                style={styles.spinner}
                size="small"
                color={colors.brand}
                accessibilityLabel={t('common.loading')}
              />
            )}
          </View>
        )}

        {/* Editable recipe phase */}
        {editable && (
          <EditableRecipeView
            recipe={editable}
            onChange={setEditable}
            selectedTags={selectedTags}
            selectedTagIds={selectedTagIds}
            allTags={tags}
            onTagAdd={handleTagAdd}
            onTagRemove={handleTagRemove}
            onTagCreate={handleTagCreate}
            activeAllergens={activeAllergens}
          />
        )}

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>{t('addRecipe.importFailed')}</Text>
            <Text style={styles.errorMsg}>{error}</Text>
          </View>
        )}
      </ScrollView>

      {/* Action bar */}
      <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {editable ? (
          <>
            <Pressable
              style={({ pressed }) => [styles.secondaryBtn, styles.flex, pressed && { opacity: 0.7 }]}
              onPress={reset}
              disabled={saving}
              accessibilityLabel={t('addRecipe.discard')}
            >
              <Text style={styles.secondaryBtnText}>{t('addRecipe.discard')}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.primaryBtn, styles.flex, saving && styles.btnDisabled, pressed && { opacity: 0.7 }]}
              onPress={handleSave}
              disabled={saving}
              accessibilityLabel={t('common.save')}
            >
              {saving ? (
                <ActivityIndicator color={colors.background} size="small" />
              ) : (
                <Text style={styles.primaryBtnText}>{t('common.save')}</Text>
              )}
            </Pressable>
          </>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.primaryBtn, styles.flex, (!url.trim() || loading) && styles.btnDisabled, pressed && { opacity: 0.7 }]}
            onPress={handleImport}
            disabled={!url.trim() || loading}
            accessibilityLabel={t('addRecipe.import')}
          >
            {loading ? (
              <ActivityIndicator color={colors.background} size="small" />
            ) : (
              <Text style={styles.primaryBtnText}>{t('addRecipe.import')}</Text>
            )}
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  )
}

export default ImportRecipeScreen

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { paddingBottom: 120 },

  // URL section
  urlSection: { padding: 16, gap: 12 },
  urlLabel: { fontSize: 14, fontWeight: '600', color: colors.secondaryLabel },
  urlRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  urlInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.opaqueSeparator,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: colors.background,
    color: colors.label,
  },
  pasteBtn: {
    backgroundColor: colors.secondaryBackground,
    borderWidth: 1,
    borderColor: colors.opaqueSeparator,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pasteBtnText: { fontSize: 14, color: colors.secondaryLabel, fontWeight: '500' },

  // Progress
  progressList: { gap: 6 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressIcon: { fontSize: 13, color: colors.secondaryLabel, width: 14 },
  progressLabel: { fontSize: 13, color: colors.secondaryLabel, flex: 1 },
  progressActive: { color: colors.brand, fontWeight: '600' },
  spinner: { marginTop: 4 },

  // Error box
  errorBox: {
    margin: 16,
    backgroundColor: '#fee2e2',
    borderRadius: 10,
    padding: 12,
  },
  errorTitle: { fontSize: 13, fontWeight: '700', color: colors.red, marginBottom: 4 },
  errorMsg: { fontSize: 13, color: '#b91c1c', lineHeight: 18 },

  // Action bar
  actionBar: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
    backgroundColor: colors.background,
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: colors.opaqueSeparator,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { fontSize: 15, color: colors.secondaryLabel, fontWeight: '500' },
  primaryBtn: {
    backgroundColor: colors.brand,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  primaryBtnText: { fontSize: 15, color: colors.background, fontWeight: '600' },
  btnDisabled: { opacity: 0.4 },

  // Editable view
  editView: { padding: 16 },

  // Title row
  titleRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 12 },
  thumbBtn: {
    width: 64,
    height: 64,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.secondaryBackground,
  },
  thumbImg: { width: 64, height: 64 },
  thumbPlaceholder: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  thumbIcon: { fontSize: 24 },
  thumbEditBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingVertical: 4,
    alignItems: 'center',
  },
  thumbEditText: { fontSize: 8, color: colors.background, fontWeight: '700', letterSpacing: 0.5 },
  titleInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: colors.label,
    borderBottomWidth: 1,
    borderColor: colors.opaqueSeparator,
    paddingBottom: 4,
    lineHeight: 24,
  },

  // Image edit modal
  imgEditOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  imgEditBox: { backgroundColor: colors.background, borderRadius: 14, padding: 20 },
  imgEditTitle: { fontSize: 14, fontWeight: '600', color: colors.secondaryLabel, marginBottom: 12 },
  imgEditInput: {
    borderWidth: 1,
    borderColor: colors.opaqueSeparator,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.label,
    marginBottom: 12,
  },
  imgEditActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  imgCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.opaqueSeparator,
  },
  imgCancelText: { fontSize: 14, color: colors.secondaryLabel },
  imgSaveBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.brand },
  imgSaveText: { fontSize: 14, color: colors.background, fontWeight: '600' },

  // Meta pills
  metaRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  servingsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.brandLight,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  servingsLabel: { fontSize: 12, color: colors.brand, fontWeight: '500' },
  servingsInput: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.brand,
    minWidth: 20,
    textAlign: 'center',
    padding: 0,
  },
  kcalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fef3c7',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  kcalInput: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400e',
    minWidth: 32,
    textAlign: 'center',
    padding: 0,
  },
  kcalLabel: { fontSize: 12, color: '#92400e', fontWeight: '500' },

  // Source badges
  sourceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  sourcePill: {
    fontSize: 11,
    color: colors.secondaryLabel,
    backgroundColor: colors.secondaryBackground,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: 220,
  },

  // Tags section
  tagsSection: { marginBottom: 16 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagChip: {
    backgroundColor: colors.brandLight,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tagChipText: { fontSize: 12, color: colors.brand, fontWeight: '500' },
  addTagBtn: {
    borderWidth: 1,
    borderColor: colors.opaqueSeparator,
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  addTagBtnText: { fontSize: 12, color: colors.secondaryLabel },

  // Tag picker modal
  tagModalWrap: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  tagModal: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
    maxHeight: '72%',
    paddingBottom: 24,
  },
  tagModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  tagModalTitle: { fontSize: 16, fontWeight: '700', color: colors.label },
  tagModalClose: { fontSize: 18, color: colors.secondaryLabel, padding: 4 },
  tagSearch: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.opaqueSeparator,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.label,
  },
  tagScrollList: { maxHeight: 320 },
  tagCreateRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.brandLight,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
  },
  tagCreateText: { fontSize: 14, color: colors.brand, fontWeight: '600' },
  tagListRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
  },
  tagListText: { fontSize: 14, color: colors.secondaryLabel },
  tagCheck: { fontSize: 16, color: colors.brand },
  tagEmpty: { padding: 16, fontSize: 13, color: colors.tertiaryLabel, textAlign: 'center' },

  // Unit picker sheet
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  unitSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
    maxHeight: '60%',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: colors.opaqueSeparator,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 8,
  },
  unitOption: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
  },
  unitOptionSel: { backgroundColor: colors.brandLight },
  unitOptionText: { fontSize: 15, color: colors.secondaryLabel },
  unitOptionTextSel: { color: colors.brand, fontWeight: '600' },

  // Ingredient editor
  ingEditor: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
    gap: 4,
  },
  ingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ingQty: {
    width: 44,
    borderBottomWidth: 1,
    borderColor: colors.opaqueSeparator,
    fontSize: 14,
    color: colors.label,
    textAlign: 'center',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  ingUnitBtn: {
    borderBottomWidth: 1,
    borderColor: colors.opaqueSeparator,
    paddingVertical: 4,
    paddingHorizontal: 4,
    minWidth: 36,
  },
  ingUnitText: { fontSize: 13, color: colors.brand, fontWeight: '500' },
  ingPlaceholder: { color: colors.tertiaryLabel },
  ingName: {
    flex: 1,
    borderBottomWidth: 1,
    borderColor: colors.opaqueSeparator,
    fontSize: 14,
    color: colors.label,
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
    color: colors.tertiaryLabel,
    borderBottomWidth: 1,
    borderColor: colors.separator,
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontStyle: 'italic',
    marginLeft: 52,
  },

  // Component sections
  componentBlock: { marginTop: 16 },
  componentTitle: { fontSize: 16, fontWeight: '700', color: colors.secondaryLabel, marginBottom: 10 },
  section: { marginBottom: 14 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.tertiaryLabel,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 8 },
  stepNum: { fontSize: 14, fontWeight: '700', color: colors.blue, width: 24, marginTop: 3 },
  stepInput: {
    flex: 1,
    fontSize: 14,
    color: colors.label,
    lineHeight: 20,
    borderBottomWidth: 1,
    borderColor: colors.opaqueSeparator,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
})
