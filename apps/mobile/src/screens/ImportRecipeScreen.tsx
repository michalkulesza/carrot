import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  PlatformColor,
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
import * as ImagePicker from 'expo-image-picker'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigation, useLocalSearchParams, useRouter } from 'expo-router'
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
import { colors } from '../theme/colors'
import { proxyThumbnailUrl, isValidImageUrl } from '../api/thumbnailUrl'

type ImportMode = 'url' | 'camera' | 'gallery' | 'text' | 'share' | 'scratch'

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

const blankRecipe = (): EditableRecipe => ({
  title: '',
  servings: '',
  kcal: '',
  thumbnail_url: null,
  creator_handle: null,
  source_url: null,
  suggestedTagNames: [],
  components: [{
    name: 'Main',
    yield_note: '',
    ingredients: [{ qty: '', unit: '', name: '', note: '' }],
    steps: [''],
    ingredient_flags: [null],
    step_ingredient_refs: null,
  }],
})

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

const IngredientEditor = ({
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
  allowEditing = false,
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
  allowEditing?: boolean
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
      ci2 !== ci ? c : {
        ...c,
        ingredients: c.ingredients.map((ing, idx) => idx === ii ? parseIngredient(flag.substitute!) : ing),
        ingredient_flags: c.ingredient_flags.map((f, idx) => idx === ii ? { ...f!, substitute_applied: true, original_display: originalDisplay } : f),
      },
    )
    onChange({ ...recipe, components })
  }

  const handleRestoreAllergen = (ci: number, ii: number) => {
    const comp = recipe.components[ci]
    const flag = comp.ingredient_flags[ii]
    if (!flag?.original_display) return
    const components = recipe.components.map((c, ci2) =>
      ci2 !== ci ? c : {
        ...c,
        ingredients: c.ingredients.map((ing, idx) => idx === ii ? parseIngredient(flag.original_display!) : ing),
        ingredient_flags: c.ingredient_flags.map((f, idx) => idx === ii ? { ...f!, substitute_applied: false, original_display: null } : f),
      },
    )
    onChange({ ...recipe, components })
  }

  const setIngredient = (ci: number, ii: number, val: StructuredIngredient) => {
    onChange({
      ...recipe,
      components: recipe.components.map((c, ci2) =>
        ci2 !== ci ? c : { ...c, ingredients: c.ingredients.map((ing, ii2) => (ii2 === ii ? val : ing)) },
      ),
    })
  }

  const addIngredient = (ci: number) => {
    onChange({
      ...recipe,
      components: recipe.components.map((c, ci2) =>
        ci2 !== ci ? c : {
          ...c,
          ingredients: [...c.ingredients, { qty: '', unit: '', name: '', note: '' }],
          ingredient_flags: [...c.ingredient_flags, null],
        },
      ),
    })
  }

  const removeIngredient = (ci: number, ii: number) => {
    const comp = recipe.components[ci]
    if (comp.ingredients.length <= 1) return
    onChange({
      ...recipe,
      components: recipe.components.map((c, ci2) =>
        ci2 !== ci ? c : {
          ...c,
          ingredients: c.ingredients.filter((_, idx) => idx !== ii),
          ingredient_flags: c.ingredient_flags.filter((_, idx) => idx !== ii),
        },
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

  const addStep = (ci: number) => {
    onChange({
      ...recipe,
      components: recipe.components.map((c, ci2) =>
        ci2 !== ci ? c : { ...c, steps: [...c.steps, ''] },
      ),
    })
  }

  const removeStep = (ci: number, si: number) => {
    const comp = recipe.components[ci]
    if (comp.steps.length <= 1) return
    onChange({
      ...recipe,
      components: recipe.components.map((c, ci2) =>
        ci2 !== ci ? c : { ...c, steps: c.steps.filter((_, idx) => idx !== si) },
      ),
    })
  }

  const currentUnit = unitPickerTarget != null
    ? (recipe.components[unitPickerTarget.ci]?.ingredients[unitPickerTarget.ii]?.unit ?? '')
    : ''

  return (
    <View style={styles.editView}>
      {/* Thumbnail + title */}
      <View style={styles.titleRow}>
        <Pressable
          style={({ pressed }) => [styles.thumbBtn, pressed && { opacity: 0.7 }]}
          onPress={() => { setImgDraft(recipe.thumbnail_url ?? ''); setShowImgEdit(true) }}
          accessibilityLabel={t('common.thumbnail')}
        >
          {recipe.thumbnail_url ? (
            <Image source={{ uri: proxyThumbnailUrl(recipe.thumbnail_url)! }} style={styles.thumbImg} resizeMode="cover" />
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
          placeholder={t('addRecipe.newRecipe')}
          placeholderTextColor={PlatformColor('placeholderText') as unknown as string}
          accessibilityLabel="recipe title"
        />
      </View>

      {/* Image URL edit modal */}
      <Modal visible={showImgEdit} transparent animationType="fade" onRequestClose={() => setShowImgEdit(false)}>
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
                  const trimmed = imgDraft.trim()
                  if (trimmed && !isValidImageUrl(trimmed)) {
                    Alert.alert(t('common.invalidImageUrl'))
                    return
                  }
                  onChange({ ...recipe, thumbnail_url: trimmed || null })
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
        <View style={styles.servingsPill}>
          <Text style={styles.servingsLabel}>{t('recipes.serves')}</Text>
          <TextInput
            style={styles.servingsInput}
            value={recipe.servings}
            onChangeText={(v) => onChange({ ...recipe, servings: v })}
            keyboardType="number-pad"
            placeholder="—"
            placeholderTextColor={colors.brand}
            accessibilityLabel={t('recipes.serves')}
          />
        </View>
        <View style={styles.kcalPill}>
          <TextInput
            style={styles.kcalInput}
            value={recipe.kcal}
            onChangeText={(v) => onChange({ ...recipe, kcal: v })}
            keyboardType="number-pad"
            placeholder="—"
            placeholderTextColor={PlatformColor('systemOrange') as unknown as string}
            accessibilityLabel={t('recipes.kcalPerServing')}
          />
          <Text style={styles.kcalLabel}>{t('recipes.kcalPerServing')}</Text>
        </View>
      </View>

      {/* Creator / source */}
      {(recipe.creator_handle || recipe.source_url) && (
        <View style={styles.sourceRow}>
          {recipe.creator_handle ? (
            <Text style={styles.sourcePill}>{t('addRecipe.by', { handle: recipe.creator_handle })}</Text>
          ) : null}
          {recipe.source_url ? (
            <Text style={styles.sourcePill} numberOfLines={1}>{recipe.source_url}</Text>
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

          {/* Ingredients */}
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
                onRemove={comp.ingredients.length > 1 ? () => removeIngredient(ci, ii) : undefined}
              />
            ))}
            <Pressable
              style={({ pressed }) => [styles.addRowBtn, pressed && { opacity: 0.7 }]}
              onPress={() => addIngredient(ci)}
              accessibilityLabel={t('addRecipe.addIngredient')}
            >
              <Text style={styles.addRowBtnText}>+ {t('addRecipe.addIngredient')}</Text>
            </Pressable>
          </View>

          {/* Steps */}
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
                {comp.steps.length > 1 && (
                  <Pressable
                    style={({ pressed }) => [styles.stepRemoveBtn, pressed && { opacity: 0.6 }]}
                    onPress={() => removeStep(ci, si)}
                    hitSlop={8}
                    accessibilityLabel={t('addRecipe.removeStep')}
                  >
                    <Text style={styles.stepRemoveText}>−</Text>
                  </Pressable>
                )}
              </View>
            ))}
            <Pressable
              style={({ pressed }) => [styles.addRowBtn, pressed && { opacity: 0.7 }]}
              onPress={() => addStep(ci)}
              accessibilityLabel={t('addRecipe.addStep')}
            >
              <Text style={styles.addRowBtnText}>+ {t('addRecipe.addStep')}</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  )
}

// ── MethodPickerView ───────────────────────────────────────────────────────────

const METHODS = [
  { key: 'url' as ImportMode, icon: '🔗', titleKey: 'addRecipe.methodUrl', descKey: 'addRecipe.methodUrlDesc', iconBg: PlatformColor('systemBlue') },
  { key: 'camera' as ImportMode, icon: '📷', titleKey: 'addRecipe.methodCamera', descKey: 'addRecipe.methodCameraDesc', iconBg: PlatformColor('systemOrange') },
  { key: 'gallery' as ImportMode, icon: '🖼', titleKey: 'addRecipe.methodGallery', descKey: 'addRecipe.methodGalleryDesc', iconBg: PlatformColor('systemGreen') },
  { key: 'text' as ImportMode, icon: '📋', titleKey: 'addRecipe.methodText', descKey: 'addRecipe.methodTextDesc', iconBg: colors.brand },
  { key: 'scratch' as ImportMode, icon: '✏️', titleKey: 'addRecipe.methodScratch', descKey: 'addRecipe.methodScratchDesc', iconBg: PlatformColor('systemPink') },
]

const MethodPickerView = ({ onSelect }: { onSelect: (mode: ImportMode) => void }) => {
  const { t } = useTranslation()
  return (
    <View style={styles.pickerWrap}>
      <Text style={styles.pickerHeading}>{t('addRecipe.chooseMethod')}</Text>
      <View style={styles.pickerGroup}>
        {METHODS.map((method, mi) => (
          <Pressable
            key={method.key}
            style={({ pressed }) => [
              styles.methodRow,
              mi < METHODS.length - 1 && styles.methodRowBorder,
              pressed && styles.methodRowPressed,
            ]}
            onPress={() => onSelect(method.key)}
            accessibilityLabel={t(method.titleKey)}
            accessibilityHint={t(method.descKey)}
          >
            <View style={[styles.methodIconWrap, { backgroundColor: method.iconBg as unknown as string }]}>
              <Text style={styles.methodIcon}>{method.icon}</Text>
            </View>
            <View style={styles.methodTextWrap}>
              <Text style={styles.methodTitle}>{t(method.titleKey)}</Text>
              <Text style={styles.methodDesc}>{t(method.descKey)}</Text>
            </View>
            <Text style={styles.methodChevron}>›</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.shareTipCard}>
        <Text style={styles.shareTipText}>{t('addRecipe.shareTip')}</Text>
      </View>
    </View>
  )
}

// ── UrlInputView ───────────────────────────────────────────────────────────────

const UrlInputView = ({
  url,
  onUrlChange,
  onPaste,
  onImport,
  loading,
  progressSteps,
}: {
  url: string
  onUrlChange: (v: string) => void
  onPaste: () => void
  onImport: () => void
  loading: boolean
  progressSteps: StepState[]
}) => {
  const { t } = useTranslation()
  return (
    <View style={styles.inputSection}>
      <View style={styles.urlInputGroup}>
        <TextInput
          style={styles.urlInput}
          value={url}
          onChangeText={onUrlChange}
          placeholder={t('addRecipe.urlPlaceholder')}
          placeholderTextColor={PlatformColor('placeholderText') as unknown as string}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          editable={!loading}
          returnKeyType="go"
          onSubmitEditing={onImport}
          accessibilityLabel={t('addRecipe.recipeUrl')}
          textContentType="URL"
        />
        <Pressable
          style={({ pressed }) => [styles.pasteBtn, pressed && { opacity: 0.7 }]}
          onPress={onPaste}
          disabled={loading}
          accessibilityLabel={t('addRecipe.paste')}
          hitSlop={4}
        >
          <Text style={styles.pasteBtnText}>{t('addRecipe.paste')}</Text>
        </Pressable>
      </View>
      {progressSteps.length > 0 && (
        <View style={styles.progressList}>
          {progressSteps.map((s) => (
            <View key={s.key} style={styles.progressRow}>
              <Text style={styles.progressIcon}>{s.status === 'done' ? '✓' : '⋯'}</Text>
              <Text style={[styles.progressLabel, s.status === 'active' && styles.progressActive]}>
                {s.label}
              </Text>
            </View>
          ))}
        </View>
      )}
      {loading && <ActivityIndicator style={styles.spinner} size="small" color={colors.brand} />}
    </View>
  )
}

// ── TextPasteView ──────────────────────────────────────────────────────────────

const TextPasteView = ({
  text,
  onTextChange,
  onPaste,
  onExtract,
  loading,
  progressSteps,
}: {
  text: string
  onTextChange: (v: string) => void
  onPaste: () => void
  onExtract: () => void
  loading: boolean
  progressSteps: StepState[]
}) => {
  const { t } = useTranslation()
  return (
    <View style={styles.inputSection}>
      <View style={styles.textInputGroup}>
        <TextInput
          style={styles.textPasteInput}
          value={text}
          onChangeText={onTextChange}
          placeholder={t('addRecipe.pasteTextPlaceholder')}
          placeholderTextColor={PlatformColor('placeholderText') as unknown as string}
          multiline
          editable={!loading}
          autoCapitalize="sentences"
          autoCorrect
          accessibilityLabel={t('addRecipe.methodText')}
        />
        <Pressable
          style={({ pressed }) => [styles.textPasteInlineBtn, pressed && { opacity: 0.7 }]}
          onPress={onPaste}
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
              <Text style={[styles.progressLabel, s.status === 'active' && styles.progressActive]}>
                {s.label}
              </Text>
            </View>
          ))}
        </View>
      )}
      {loading && <ActivityIndicator style={styles.spinner} size="small" color={colors.brand} />}
    </View>
  )
}

// ── ShareView ──────────────────────────────────────────────────────────────────

const ShareView = ({
  url,
  onUrlChange,
  onPaste,
  onImport,
  loading,
  progressSteps,
}: {
  url: string
  onUrlChange: (v: string) => void
  onPaste: () => void
  onImport: () => void
  loading: boolean
  progressSteps: StepState[]
}) => {
  const { t } = useTranslation()
  return (
    <View style={styles.inputSection}>
      <View style={styles.shareTipCard}>
        <Text style={styles.shareTipText}>{t('addRecipe.shareTitle')}{'\n'}{t('addRecipe.shareInstructions')}</Text>
      </View>
      <Text style={styles.shareUrlLabel}>{t('addRecipe.shareUrlLabel')}</Text>
      <View style={styles.urlInputGroup}>
        <TextInput
          style={styles.urlInput}
          value={url}
          onChangeText={onUrlChange}
          placeholder={t('addRecipe.urlPlaceholder')}
          placeholderTextColor={PlatformColor('placeholderText') as unknown as string}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          editable={!loading}
          returnKeyType="go"
          onSubmitEditing={onImport}
          accessibilityLabel={t('addRecipe.shareUrlLabel')}
          textContentType="URL"
        />
        <Pressable
          style={({ pressed }) => [styles.pasteBtn, pressed && { opacity: 0.7 }]}
          onPress={onPaste}
          disabled={loading}
          accessibilityLabel={t('addRecipe.paste')}
          hitSlop={4}
        >
          <Text style={styles.pasteBtnText}>{t('addRecipe.paste')}</Text>
        </Pressable>
      </View>
      {progressSteps.length > 0 && (
        <View style={styles.progressList}>
          {progressSteps.map((s) => (
            <View key={s.key} style={styles.progressRow}>
              <Text style={styles.progressIcon}>{s.status === 'done' ? '✓' : '⋯'}</Text>
              <Text style={[styles.progressLabel, s.status === 'active' && styles.progressActive]}>
                {s.label}
              </Text>
            </View>
          ))}
        </View>
      )}
      {loading && <ActivityIndicator style={styles.spinner} size="small" color={colors.brand} />}
    </View>
  )
}

// ── ImportRecipeScreen ─────────────────────────────────────────────────────────

const ImportRecipeScreen = () => {
  const { type: sharedTypeParam, value: sharedValueParam, method: methodParam } = useLocalSearchParams<{ type?: string; value?: string; method?: string }>()
  const navigation = useNavigation()
  const router = useRouter()
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const api = useApiClient()
  const qc = useQueryClient()
  const { tags, create: createTagMutation } = useTags()
  const { preferences } = usePreferences()

  const [mode, setMode] = useState<ImportMode | null>(null)
  const [url, setUrl] = useState('')
  const [pastedText, setPastedText] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [progressSteps, setProgressSteps] = useState<StepState[]>([])
  const [editable, setEditable] = useState<EditableRecipe | null>(null)
  const [selectedTags, setSelectedTags] = useState<Tag[]>([])
  const [error, setError] = useState<string | null>(null)
  const cancelRef = useRef<(() => void) | null>(null)
  const skipGuardRef = useRef(false)
  const pendingThumbRef = useRef<string | null>(null)

  const activeAllergens = useMemo(() => {
    const p = preferences?.personal_allergens
    return p ? [...(p.predefined ?? []), ...(p.custom ?? [])] : []
  }, [preferences])

  const autoSubstitute = preferences?.auto_substitute ?? false

  useEffect(() => () => { cancelRef.current?.() }, [])

  // Handle content shared from the native Share Extension via deep link params
  useEffect(() => {
    if (!sharedTypeParam || !sharedValueParam || editable) return
    if (sharedTypeParam === 'url') {
      setMode('share')
      setUrl(sharedValueParam)
    } else if (sharedTypeParam === 'text') {
      setMode('text')
      setPastedText(sharedValueParam)
    }
  }, [sharedTypeParam, sharedValueParam])

  // Handle method pre-selected from the add-recipe popover
  useEffect(() => {
    if (methodParam && !sharedTypeParam) {
      setMode(methodParam as ImportMode)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Handle raw http(s) URLs opened via Linking (e.g. from browser tap on universal links)
  useEffect(() => {
    const handleUrl = ({ url: incomingUrl }: { url: string }) => {
      const trimmed = incomingUrl.trim()
      if (trimmed.startsWith('http') && !editable) {
        setMode('url')
        setUrl(trimmed)
      }
    }
    const sub = Linking.addEventListener('url', handleUrl)
    Linking.getInitialURL().then((initialUrl) => {
      if (initialUrl?.startsWith('http')) handleUrl({ url: initialUrl })
    })
    return () => sub.remove()
  }, [editable])

  useEffect(() => {
    if (!editable) return
    const unsub = navigation.addListener('beforeRemove', (e) => {
      if (skipGuardRef.current) return
      e.preventDefault()
      Alert.alert(t('addRecipe.discard'), undefined, [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('addRecipe.discard'), style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
      ])
    })
    return unsub
  }, [navigation, editable, t])

  useLayoutEffect(() => {
    if (editable) {
      navigation.setOptions({
        headerLeft: undefined,
      })
    } else if (mode) {
      navigation.setOptions({
        headerLeft: () => (
          <Pressable
            onPress={() => { reset(); setMode(null) }}
            hitSlop={8}
            style={({ pressed }) => [{ paddingHorizontal: 4 }, pressed && { opacity: 0.5 }]}
            accessibilityLabel={t('common.cancel')}
          >
            <Text style={styles.headerBackBtn}>{t('common.back')}</Text>
          </Pressable>
        ),
      })
    } else {
      navigation.setOptions({
        headerLeft: undefined,
      })
    }
  }, [navigation, mode, editable, t])

  const handlePasteUrl = async () => {
    const text = await Clipboard.getStringAsync()
    if (text) setUrl(text.trim())
  }

  const handlePasteText = async () => {
    const text = await Clipboard.getStringAsync()
    if (text) setPastedText((prev) => (prev ? prev + '\n' + text : text))
  }

  const reset = () => {
    cancelRef.current?.()
    setLoading(false)
    setProgressSteps([])
    setEditable(null)
    setSelectedTags([])
    setError(null)
    setUrl('')
    setPastedText('')
    pendingThumbRef.current = null
  }

  const applyImportResult = (res: ImportResult) => {
    if (res.recipe) {
      const editableRecipe = toEditable(res, autoSubstitute)
      if (!editableRecipe.thumbnail_url && pendingThumbRef.current) {
        editableRecipe.thumbnail_url = pendingThumbRef.current
      }
      pendingThumbRef.current = null
      setEditable(editableRecipe)
      setSelectedTags(
        tags.filter((tag) =>
          editableRecipe.suggestedTagNames.some((name) => name.toLowerCase() === tag.name.toLowerCase()),
        ),
      )
    } else {
      setError(res.error ?? t('addRecipe.importFailed'))
    }
    setLoading(false)
  }

  const startStreamCallbacks = () => ({
    onStage(stage: StageEvent) {
      setProgressSteps((prev) => [
        ...prev.map((s) => (s.status === 'active' ? { ...s, status: 'done' as const } : s)),
        { ...stage, status: 'active' },
      ])
    },
    onDone(res: ImportResult) {
      setProgressSteps((prev) =>
        prev.map((s) => (s.status === 'active' ? { ...s, status: 'done' as const } : s)),
      )
      applyImportResult(res)
    },
    onError(msg: string) {
      setError(msg)
      setLoading(false)
    },
  })

  const handleImportUrl = () => {
    if (!url.trim()) return
    cancelRef.current?.()
    setLoading(true)
    setError(null)
    setEditable(null)
    setSelectedTags([])
    setProgressSteps([])
    cancelRef.current = api.streamImportFetch(url.trim(), startStreamCallbacks())
  }

  const handleImportText = () => {
    if (!pastedText.trim()) return
    cancelRef.current?.()
    setLoading(true)
    setError(null)
    setEditable(null)
    setSelectedTags([])
    setProgressSteps([])
    cancelRef.current = api.streamTextImportFetch(pastedText.trim(), startStreamCallbacks())
  }

  const handleCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert(
        t('addRecipe.cameraPermissionDenied'),
        t('addRecipe.cameraPermissionDeniedMsg'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('addRecipe.openSettings'), onPress: () => Linking.openSettings() },
        ],
      )
      return
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      base64: true,
    })
    if (!result.canceled && result.assets[0]?.base64) {
      startImageImport(result.assets[0].base64, result.assets[0].mimeType ?? 'image/jpeg')
    }
  }

  const handleGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert(
        t('addRecipe.galleryPermissionDenied'),
        t('addRecipe.galleryPermissionDeniedMsg'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('addRecipe.openSettings'), onPress: () => Linking.openSettings() },
        ],
      )
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      base64: true,
    })
    if (!result.canceled && result.assets[0]?.base64) {
      startImageImport(result.assets[0].base64, result.assets[0].mimeType ?? 'image/jpeg')
    }
  }

  const startImageImport = (imageBase64: string, mimeType: string) => {
    cancelRef.current?.()
    pendingThumbRef.current = `data:${mimeType};base64,${imageBase64}`
    setLoading(true)
    setError(null)
    setEditable(null)
    setSelectedTags([])
    setProgressSteps([])
    cancelRef.current = api.streamImageImportFetch(imageBase64, mimeType, startStreamCallbacks())
  }

  const handleModeSelect = (selectedMode: ImportMode) => {
    reset()
    if (selectedMode === 'camera') {
      setMode('camera')
      handleCamera()
    } else if (selectedMode === 'gallery') {
      setMode('gallery')
      handleGallery()
    } else if (selectedMode === 'scratch') {
      setMode('scratch')
      setEditable(blankRecipe())
    } else {
      setMode(selectedMode)
    }
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
            (f) => f ?? { allergen: null, substitute: null, substitute_applied: false, original_display: null },
          ),
          step_ingredient_refs: c.step_ingredient_refs,
        })),
        tag_ids: selectedTags.map((tag) => tag.id),
      })
      await qc.invalidateQueries({ queryKey: ['recipes'] })
      skipGuardRef.current = true
      router.back()
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
  const handleTagAdd = useCallback((tag: Tag) => setSelectedTags((prev) => [...prev, tag]), [])
  const handleTagRemove = useCallback((id: string) => setSelectedTags((prev) => prev.filter((tag) => tag.id !== id)), [])
  const selectedTagIds = useMemo(() => new Set(selectedTags.map((tag) => tag.id)), [selectedTags])

  const showImportBtn = mode === 'url' && !loading && !editable
  const showImportShareBtn = mode === 'share' && !loading && !editable
  const showExtractBtn = mode === 'text' && !loading && !editable

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={88}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        {/* Picker — shown when no mode selected and no editable */}
        {!mode && !editable && (
          <MethodPickerView onSelect={handleModeSelect} />
        )}

        {/* URL import */}
        {mode === 'url' && !editable && (
          <UrlInputView
            url={url}
            onUrlChange={setUrl}
            onPaste={handlePasteUrl}
            onImport={handleImportUrl}
            loading={loading}
            progressSteps={progressSteps}
          />
        )}

        {/* Text paste */}
        {mode === 'text' && !editable && (
          <TextPasteView
            text={pastedText}
            onTextChange={setPastedText}
            onPaste={handlePasteText}
            onExtract={handleImportText}
            loading={loading}
            progressSteps={progressSteps}
          />
        )}

        {/* Share */}
        {mode === 'share' && !editable && (
          <ShareView
            url={url}
            onUrlChange={setUrl}
            onPaste={handlePasteUrl}
            onImport={handleImportUrl}
            loading={loading}
            progressSteps={progressSteps}
          />
        )}

        {/* Camera/Gallery loading state (no dedicated view, just progress) */}
        {(mode === 'camera' || mode === 'gallery') && !editable && (
          <View style={styles.inputSection}>
            {progressSteps.length > 0 && (
              <View style={styles.progressList}>
                {progressSteps.map((s) => (
                  <View key={s.key} style={styles.progressRow}>
                    <Text style={styles.progressIcon}>{s.status === 'done' ? '✓' : '⋯'}</Text>
                    <Text style={[styles.progressLabel, s.status === 'active' && styles.progressActive]}>
                      {s.label}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            {loading && <ActivityIndicator style={styles.spinner} size="large" color={colors.brand} />}
          </View>
        )}

        {/* Editable recipe view */}
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
            allowEditing={mode === 'scratch'}
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
      {(mode || editable) && (
        <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          {editable ? (
            <>
              <Pressable
                style={({ pressed }) => [styles.secondaryBtn, styles.flex, pressed && { opacity: 0.7 }]}
                onPress={() => { reset(); setMode(null) }}
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
          ) : showImportBtn ? (
            <Pressable
              style={({ pressed }) => [styles.primaryBtn, styles.flex, (!url.trim() || loading) && styles.btnDisabled, pressed && { opacity: 0.7 }]}
              onPress={handleImportUrl}
              disabled={!url.trim() || loading}
              accessibilityLabel={t('addRecipe.import')}
            >
              {loading ? (
                <ActivityIndicator color={colors.background} size="small" />
              ) : (
                <Text style={styles.primaryBtnText}>{t('addRecipe.import')}</Text>
              )}
            </Pressable>
          ) : showImportShareBtn ? (
            <Pressable
              style={({ pressed }) => [styles.primaryBtn, styles.flex, (!url.trim() || loading) && styles.btnDisabled, pressed && { opacity: 0.7 }]}
              onPress={handleImportUrl}
              disabled={!url.trim() || loading}
              accessibilityLabel={t('addRecipe.import')}
            >
              {loading ? (
                <ActivityIndicator color={colors.background} size="small" />
              ) : (
                <Text style={styles.primaryBtnText}>{t('addRecipe.import')}</Text>
              )}
            </Pressable>
          ) : showExtractBtn ? (
            <Pressable
              style={({ pressed }) => [styles.primaryBtn, styles.flex, (!pastedText.trim() || loading) && styles.btnDisabled, pressed && { opacity: 0.7 }]}
              onPress={handleImportText}
              disabled={!pastedText.trim() || loading}
              accessibilityLabel={t('addRecipe.extractRecipe')}
            >
              {loading ? (
                <ActivityIndicator color={colors.background} size="small" />
              ) : (
                <Text style={styles.primaryBtnText}>{t('addRecipe.extractRecipe')}</Text>
              )}
            </Pressable>
          ) : null}
        </View>
      )}
    </KeyboardAvoidingView>
  )
}

export default ImportRecipeScreen

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { paddingBottom: 120 },

  // Header back button
  headerBackBtn: {
    fontSize: 17,
    color: PlatformColor('systemBlue') as unknown as string,
  },

  // Method picker
  pickerWrap: { paddingTop: 8, paddingHorizontal: 16, gap: 12 },
  pickerHeading: {
    fontSize: 13,
    fontWeight: '500',
    color: PlatformColor('secondaryLabel') as unknown as string,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 4,
    marginLeft: 4,
  },
  pickerGroup: {
    backgroundColor: PlatformColor('secondarySystemBackground') as unknown as string,
    borderRadius: 12,
    overflow: 'hidden',
  },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
    backgroundColor: PlatformColor('secondarySystemBackground') as unknown as string,
    minHeight: 64,
  },
  methodRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PlatformColor('separator') as unknown as string,
  },
  methodRowPressed: {
    backgroundColor: PlatformColor('systemFill') as unknown as string,
  },
  methodIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodIcon: { fontSize: 20 },
  methodTextWrap: { flex: 1 },
  methodTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: PlatformColor('label') as unknown as string,
    marginBottom: 1,
  },
  methodDesc: {
    fontSize: 13,
    color: PlatformColor('secondaryLabel') as unknown as string,
    lineHeight: 17,
  },
  methodChevron: {
    fontSize: 20,
    color: PlatformColor('systemGray3') as unknown as string,
    fontWeight: '300',
  },

  // Input section (common wrapper for all input modes)
  inputSection: { padding: 16, gap: 12 },

  // URL input
  urlInputGroup: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  urlInput: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PlatformColor('opaqueSeparator') as unknown as string,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 16,
    backgroundColor: PlatformColor('secondarySystemBackground') as unknown as string,
    color: PlatformColor('label') as unknown as string,
  },
  pasteBtn: {
    backgroundColor: PlatformColor('secondarySystemBackground') as unknown as string,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PlatformColor('opaqueSeparator') as unknown as string,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  pasteBtnText: {
    fontSize: 16,
    color: PlatformColor('secondaryLabel') as unknown as string,
    fontWeight: '500',
  },

  // Text paste input
  textInputGroup: { gap: 8 },
  textPasteInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PlatformColor('opaqueSeparator') as unknown as string,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: 16,
    backgroundColor: PlatformColor('secondarySystemBackground') as unknown as string,
    color: PlatformColor('label') as unknown as string,
    minHeight: 200,
    textAlignVertical: 'top',
  },
  textPasteInlineBtn: {
    alignSelf: 'flex-start',
    backgroundColor: PlatformColor('secondarySystemBackground') as unknown as string,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PlatformColor('opaqueSeparator') as unknown as string,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  // Share tip card
  shareTipCard: {
    backgroundColor: PlatformColor('secondarySystemBackground') as unknown as string,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  shareTipText: {
    fontSize: 13,
    color: PlatformColor('secondaryLabel') as unknown as string,
    lineHeight: 19,
  },

  // Share URL label (used when share extension delivers a URL)
  shareUrlLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: PlatformColor('secondaryLabel') as unknown as string,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginLeft: 4,
  },

  // Progress
  progressList: { gap: 6 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressIcon: { fontSize: 13, color: PlatformColor('secondaryLabel') as unknown as string, width: 14 },
  progressLabel: { fontSize: 13, color: PlatformColor('secondaryLabel') as unknown as string, flex: 1 },
  progressActive: { color: colors.brand, fontWeight: '600' },
  spinner: { marginTop: 8 },

  // Error box
  errorBox: {
    margin: 16,
    backgroundColor: colors.brandLight,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.brand,
  },
  errorTitle: { fontSize: 13, fontWeight: '700', color: colors.brand, marginBottom: 4 },
  errorMsg: { fontSize: 13, color: colors.brand, lineHeight: 18, opacity: 0.8 },

  // Action bar
  actionBar: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: PlatformColor('separator') as unknown as string,
    backgroundColor: PlatformColor('systemBackground') as unknown as string,
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: PlatformColor('opaqueSeparator') as unknown as string,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { fontSize: 16, color: PlatformColor('secondaryLabel') as unknown as string, fontWeight: '500' },
  primaryBtn: {
    backgroundColor: colors.brand,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  primaryBtnText: { fontSize: 16, color: '#fff', fontWeight: '600' },
  btnDisabled: { opacity: 0.4 },

  // Editable view
  editView: { padding: 16 },

  // Title row
  titleRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 12 },
  thumbBtn: {
    width: 68,
    height: 68,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: PlatformColor('secondarySystemBackground') as unknown as string,
  },
  thumbImg: { width: 68, height: 68 },
  thumbPlaceholder: { width: 68, height: 68, alignItems: 'center', justifyContent: 'center' },
  thumbIcon: { fontSize: 28 },
  thumbEditBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingVertical: 4,
    alignItems: 'center',
  },
  thumbEditText: { fontSize: 8, color: '#fff', fontWeight: '700', letterSpacing: 0.5 },
  titleInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: PlatformColor('label') as unknown as string,
    borderBottomWidth: 1,
    borderColor: PlatformColor('opaqueSeparator') as unknown as string,
    paddingBottom: 4,
    lineHeight: 26,
  },

  // Image edit modal
  imgEditOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  imgEditBox: {
    backgroundColor: PlatformColor('systemBackground') as unknown as string,
    borderRadius: 14,
    padding: 20,
  },
  imgEditTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: PlatformColor('secondaryLabel') as unknown as string,
    marginBottom: 12,
  },
  imgEditInput: {
    borderWidth: 1,
    borderColor: PlatformColor('opaqueSeparator') as unknown as string,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    color: PlatformColor('label') as unknown as string,
    marginBottom: 12,
  },
  imgEditActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  imgCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: PlatformColor('opaqueSeparator') as unknown as string,
  },
  imgCancelText: { fontSize: 16, color: PlatformColor('secondaryLabel') as unknown as string },
  imgSaveBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.brand },
  imgSaveText: { fontSize: 16, color: '#fff', fontWeight: '600' },

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
    minWidth: 24,
    textAlign: 'center',
    padding: 0,
  },
  kcalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: PlatformColor('systemFill') as unknown as string,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  kcalInput: {
    fontSize: 12,
    fontWeight: '700',
    color: PlatformColor('systemOrange') as unknown as string,
    minWidth: 32,
    textAlign: 'center',
    padding: 0,
  },
  kcalLabel: { fontSize: 12, color: PlatformColor('systemOrange') as unknown as string, fontWeight: '500' },

  // Source badges
  sourceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  sourcePill: {
    fontSize: 11,
    color: PlatformColor('secondaryLabel') as unknown as string,
    backgroundColor: PlatformColor('secondarySystemBackground') as unknown as string,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: 220,
  },

  // Tags section
  tagsSection: { marginBottom: 16 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagChip: { backgroundColor: colors.brandLight, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  tagChipText: { fontSize: 12, color: colors.brand, fontWeight: '500' },
  addTagBtn: {
    borderWidth: 1,
    borderColor: PlatformColor('opaqueSeparator') as unknown as string,
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  addTagBtnText: { fontSize: 12, color: PlatformColor('secondaryLabel') as unknown as string },

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

  // Add row buttons
  addRowBtn: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignSelf: 'flex-start',
  },
  addRowBtnText: {
    fontSize: 16,
    color: colors.brand,
    fontWeight: '500',
  },

  // Component sections
  componentBlock: { marginTop: 16 },
  componentTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: PlatformColor('secondaryLabel') as unknown as string,
    marginBottom: 10,
  },
  section: { marginBottom: 14 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: PlatformColor('tertiaryLabel') as unknown as string,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 8 },
  stepNum: {
    fontSize: 16,
    fontWeight: '700',
    color: PlatformColor('systemBlue') as unknown as string,
    width: 24,
    marginTop: 3,
  },
  stepInput: {
    flex: 1,
    fontSize: 16,
    color: PlatformColor('label') as unknown as string,
    lineHeight: 20,
    borderBottomWidth: 1,
    borderColor: PlatformColor('opaqueSeparator') as unknown as string,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  stepRemoveBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: PlatformColor('systemRed') as unknown as string,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 3,
  },
  stepRemoveText: { fontSize: 16, color: '#fff', fontWeight: '600', lineHeight: 20 },
})
