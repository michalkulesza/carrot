import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ComponentProps } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Linking,
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
import { Feather, Ionicons } from '@expo/vector-icons'
import * as Clipboard from 'expo-clipboard'
import * as Haptics from 'expo-haptics'
import * as ImagePicker from 'expo-image-picker'
import * as Notifications from 'expo-notifications'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigation, useLocalSearchParams, useRouter } from 'expo-router'
import { useApiClient } from '@platekeeper/shared/api/context'
import { useNotificationHistory } from '../context/NotificationHistoryContext'
import BugReportButton from '../components/BugReportButton'
import NutritionBoxGrid from '../components/NutritionBoxGrid'
import { UnitPickerModal, TagPickerModal, IngredientEditor } from '../components/RecipeFieldEditors'
import { useTags } from '@platekeeper/shared/hooks/useTags'
import { usePreferences } from '@platekeeper/shared/hooks/usePreferences'
import type {
  AllergenFlag,
  ImportDebugUsage,
  ImportJobKind,
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
import { proxyThumbnailUrl } from '../api/thumbnailUrl'
import { uploadThumbnailImage, makeTempRecipeId } from '../api/uploadThumbnail'

type ImportMode = 'url' | 'camera' | 'gallery' | 'text' | 'share' | 'scratch'

// ── Local types ────────────────────────────────────────────────────────────────

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
  protein: string
  fat: string
  carbs: string
  thumbnail_url: string | null
  creator_handle: string | null
  source_url: string | null
  components: EditableComponent[]
  suggestedTagNames: string[]
  debug: ImportDebugUsage | null
}

// ── Pure helpers ───────────────────────────────────────────────────────────────

const toEditable = (result: ImportResult, autoSubstitute: boolean): EditableRecipe => {
  const { recipe, metadata } = result
  return {
    title: recipe?.title ?? '',
    servings: recipe?.servings?.toString() ?? '',
    kcal: recipe?.kcal_per_serving?.toString() ?? '',
    protein: recipe?.protein_per_serving?.toString() ?? '',
    fat: recipe?.fat_per_serving?.toString() ?? '',
    carbs: recipe?.carbs_per_serving?.toString() ?? '',
    thumbnail_url: metadata.thumbnail_url,
    creator_handle: metadata.creator_handle,
    source_url: metadata.source_url || null,
    suggestedTagNames: recipe?.tags ?? [],
    debug: metadata.debug ?? null,
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
  protein: '',
  fat: '',
  carbs: '',
  thumbnail_url: null,
  creator_handle: null,
  source_url: null,
  suggestedTagNames: [],
  debug: null,
  components: [{
    name: 'Main',
    yield_note: '',
    ingredients: [{ qty: '', unit: '', name: '', note: '' }],
    steps: [''],
    ingredient_flags: [null],
    step_ingredient_refs: null,
  }],
})

const isBlankRecipe = (r: EditableRecipe): boolean =>
  !r.title.trim() &&
  !r.thumbnail_url &&
  r.components.every(
    (c) =>
      c.ingredients.every((ing) => !ing.name.trim()) &&
      c.steps.every((s) => !s.trim()),
  )

// Progress target per pipeline stage key (0..1) — the backend only emits discrete
// named stages, no numeric progress value, so this is a heuristic approximation.
const STAGE_PROGRESS: Record<string, number> = {
  fetching_page: 0.25,
  analyzing_page: 0.70,
  fetching_metadata: 0.15,
  checking_description: 0.35,
  checking_links: 0.55,
  fetching_transcript: 0.65,
  analyzing_transcript: 0.82,
  analyzing_text: 0.70,
  analyzing_image: 0.70,
}

// ── RecipeImportSkeleton ────────────────────────────────────────────────────────
// Shown in place of the recipe form while an import is streaming in. Mirrors the
// exact layout of RecipeFormView/the saved-recipe detail screen so the transition
// into the real content, once it arrives, doesn't jump.

const useSkeletonPulse = () => {
  const pulse = useRef(new Animated.Value(0.4)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [pulse])
  return pulse
}

const INGREDIENT_BONE_WIDTHS = ['92%', '78%', '85%', '64%', '80%'] as const
const STEP_BONE_COUNT = 3

const RecipeImportSkeleton = ({ progress }: { progress: Animated.Value }) => {
  const opacity = useSkeletonPulse()
  return (
    <View>
      <View style={[styles.previewHeroImage, styles.skeletonHeroWrap]}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.skeletonBone, { opacity }]} />
        <View style={styles.skeletonProgressCard}>
          <Ionicons name="restaurant-outline" size={22} color={PlatformColor('secondaryLabel') as unknown as string} />
          <View style={styles.skeletonProgressTrack}>
            <Animated.View
              style={[
                styles.skeletonProgressFill,
                { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
              ]}
            />
          </View>
        </View>
      </View>
      <View style={styles.previewCard}>
        <Animated.View style={[styles.skeletonBone, styles.skeletonTitleLine, { opacity, width: '70%' }]} />
        <Animated.View style={[styles.skeletonBone, styles.skeletonTitleLine, { opacity, width: '42%', marginBottom: 14 }]} />

        <View style={styles.previewTagRow}>
          {[54, 68, 46].map((w, i) => (
            <Animated.View key={i} style={[styles.skeletonBone, styles.skeletonTag, { opacity, width: w }]} />
          ))}
        </View>

        <View style={styles.skeletonMetaRow}>
          {Array.from({ length: 5 }).map((_, i) => (
            <View key={i} style={styles.skeletonMetaBox}>
              <Animated.View style={[styles.skeletonBone, styles.skeletonMetaNumber, { opacity }]} />
              <Animated.View style={[styles.skeletonBone, styles.skeletonMetaLabel, { opacity }]} />
            </View>
          ))}
        </View>

        <View style={styles.previewSection}>
          <Animated.View style={[styles.skeletonBone, styles.skeletonLabel, { opacity }]} />
          {INGREDIENT_BONE_WIDTHS.map((w, i) => (
            <View key={i} style={styles.previewIngredientRow}>
              <Animated.View style={[styles.skeletonBone, styles.skeletonBullet, { opacity }]} />
              <Animated.View style={[styles.skeletonBone, styles.skeletonIngredientLine, { opacity, width: w }]} />
            </View>
          ))}
        </View>

        <View style={styles.previewSection}>
          <Animated.View style={[styles.skeletonBone, styles.skeletonLabel, { opacity }]} />
          {Array.from({ length: STEP_BONE_COUNT }).map((_, i) => (
            <View key={i} style={styles.previewStepRow}>
              <Animated.View style={[styles.skeletonBone, styles.skeletonStepNum, { opacity }]} />
              <View style={styles.flex}>
                <Animated.View style={[styles.skeletonBone, styles.skeletonStepLine, { opacity, width: '100%', marginBottom: 6 }]} />
                <Animated.View style={[styles.skeletonBone, styles.skeletonStepLine, { opacity, width: '58%' }]} />
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  )
}

// ── RecipeFormView ──────────────────────────────────────────────────────────────
// Renders the imported recipe styled like the saved-recipe detail screen — as a
// read-only preview (editing=false) right after import, or in-place as an
// editable form (editing=true) once the user taps the header edit button. Both
// modes share the same layout so switching between them doesn't jump the UI.

const RecipeFormView = ({
  recipe,
  editing,
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
  editing: boolean
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
  const insets = useSafeAreaInsets()
  const [unitPickerTarget, setUnitPickerTarget] = useState<{ ci: number; ii: number } | null>(null)
  const [showTagPicker, setShowTagPicker] = useState(false)
  const [uploadingThumb, setUploadingThumb] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const tempRecipeIdRef = useRef(makeTempRecipeId())

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert(t('recipes.galleryPermissionDenied'), t('recipes.galleryPermissionDeniedMsg'))
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
      allowsEditing: false,
    })
    if (result.canceled || !result.assets[0]) return

    const asset = result.assets[0]
    setUploadingThumb(true)
    setUploadProgress(0)
    try {
      const data = await uploadThumbnailImage(tempRecipeIdRef.current, asset, setUploadProgress)
      onChange({ ...recipe, thumbnail_url: data.url })
    } catch {
      Alert.alert(t('common.ok'), t('common.uploadFailed'))
    } finally {
      setUploadingThumb(false)
      setUploadProgress(0)
    }
  }

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

  const hasImage = !!recipe.thumbnail_url

  return (
    <View>
      {hasImage ? (
        <View>
          <Image
            source={{ uri: proxyThumbnailUrl(recipe.thumbnail_url!)! }}
            style={styles.previewHeroImage}
            accessibilityLabel={recipe.title}
            resizeMode="cover"
          />
          {editing && (
            <Pressable
              style={({ pressed }) => [styles.previewHeroEditBtn, pressed && { opacity: 0.7 }]}
              onPress={handlePickImage}
              disabled={uploadingThumb}
              accessibilityLabel={t('common.changePhoto')}
            >
              {uploadingThumb ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Feather name="camera" size={14} color="#ffffff" />
              )}
              <Text style={styles.previewHeroEditText}>
                {uploadingThumb ? t('common.uploading') : t('common.changePhoto')}
              </Text>
            </Pressable>
          )}
        </View>
      ) : editing ? (
        <Pressable
          style={({ pressed }) => [styles.previewHeroImage, styles.previewHeroPlaceholder, pressed && { opacity: 0.7 }]}
          onPress={handlePickImage}
          disabled={uploadingThumb}
          accessibilityLabel={t('common.addPhoto')}
        >
          {uploadingThumb ? (
            <ActivityIndicator size="small" />
          ) : (
            <>
              <Feather name="camera" size={28} color={PlatformColor('secondaryLabel') as unknown as string} />
              <Text style={styles.previewHeroPlaceholderText}>{t('common.addPhoto')}</Text>
            </>
          )}
        </Pressable>
      ) : (
        <View style={{ height: insets.top + 56 }} />
      )}

      <View style={styles.previewCard}>
        {editing ? (
          <TextInput
            style={[styles.previewTitle, styles.previewTitleInput]}
            value={recipe.title}
            onChangeText={(v) => onChange({ ...recipe, title: v })}
            multiline
            placeholder={t('addRecipe.newRecipe')}
            placeholderTextColor={PlatformColor('placeholderText') as unknown as string}
            accessibilityLabel="recipe title"
          />
        ) : (
          <Text style={styles.previewTitle}>{recipe.title || t('addRecipe.newRecipe')}</Text>
        )}

        {(selectedTags.length > 0 || editing) && (
          <View style={styles.previewTagRow}>
            {selectedTags.map((tag) =>
              editing ? (
                <Pressable
                  key={tag.id}
                  style={({ pressed }) => [styles.previewTag, pressed && { opacity: 0.7 }]}
                  onPress={() => onTagRemove(tag.id)}
                  accessibilityLabel={`${tag.name}, tap to remove`}
                >
                  <Text style={styles.previewTagText}>{tTag(tag.name, t)} ×</Text>
                </Pressable>
              ) : (
                <View key={tag.id} style={styles.previewTag}>
                  <Text style={styles.previewTagText}>{tTag(tag.name, t)}</Text>
                </View>
              ),
            )}
            {editing && (
              <Pressable
                style={({ pressed }) => [styles.previewAddTagBtn, pressed && { opacity: 0.7 }]}
                onPress={() => setShowTagPicker(true)}
                accessibilityLabel={t('tags.addTag')}
              >
                <Text style={styles.previewAddTagText}>+ {t('tags.addTag')}</Text>
              </Pressable>
            )}
          </View>
        )}

        <NutritionBoxGrid
          editing={editing}
          items={[
            { label: t('recipes.serves'), value: recipe.servings, accessibilityLabel: t('recipes.serves') },
            {
              label: t(editing ? 'recipes.kcalPerServing' : 'recipes.colKcal'),
              value: recipe.kcal,
              accessibilityLabel: t('recipes.kcalPerServing'),
            },
            {
              label: t(editing ? 'recipes.proteinPerServing' : 'recipes.protein'),
              value: recipe.protein,
              accessibilityLabel: t('recipes.proteinPerServing'),
            },
            {
              label: t(editing ? 'recipes.fatPerServing' : 'recipes.fat'),
              value: recipe.fat,
              accessibilityLabel: t('recipes.fatPerServing'),
            },
            {
              label: t(editing ? 'recipes.carbsPerServing' : 'recipes.carbs'),
              value: recipe.carbs,
              accessibilityLabel: t('recipes.carbsPerServing'),
            },
          ]}
          onChangeValue={(index, value) => {
            const key = (['servings', 'kcal', 'protein', 'fat', 'carbs'] as const)[index]
            onChange({ ...recipe, [key]: value })
          }}
          disclaimerText={t('recipes.nutritionEstimateDisclaimer')}
          disclaimerAccessibilityLabel={t('recipes.nutritionEstimateDisclaimer')}
        />

        {(recipe.creator_handle || recipe.source_url) && (
          <View style={styles.previewSourceRow}>
            {recipe.creator_handle ? (
              <Text style={styles.previewSourceText}>{t('addRecipe.by', { handle: recipe.creator_handle })}</Text>
            ) : null}
            {recipe.source_url ? (
              <Text style={styles.previewSourceText} numberOfLines={1}>
                {recipe.source_url}
              </Text>
            ) : null}
          </View>
        )}

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

        {recipe.components.map((comp, ci) => (
          <View key={ci} style={styles.previewComponentBlock}>
            {recipe.components.length > 1 && comp.name ? (
              <Text style={styles.previewComponentName}>{comp.name}</Text>
            ) : null}

            {(comp.ingredients.length > 0 || editing) && (
              <View style={styles.previewSection}>
                <Text style={styles.previewSectionLabel}>{t('recipes.sectionIngredients')}</Text>
                {comp.ingredients.map((ing, ii) =>
                  editing ? (
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
                  ) : (
                    <View key={ii} style={styles.previewIngredientRow}>
                      <Text style={styles.previewBullet}>{'•'}</Text>
                      <Text style={styles.previewIngredientText}>{serializeIngredient(ing)}</Text>
                    </View>
                  ),
                )}
                {editing && (
                  <Pressable
                    style={({ pressed }) => [styles.addRowBtn, pressed && { opacity: 0.7 }]}
                    onPress={() => addIngredient(ci)}
                    accessibilityLabel={t('addRecipe.addIngredient')}
                  >
                    <Text style={styles.addRowBtnText}>+ {t('addRecipe.addIngredient')}</Text>
                  </Pressable>
                )}
              </View>
            )}

            {(comp.steps.length > 0 || editing) && (
              <View style={styles.previewSection}>
                <Text style={styles.previewSectionLabel}>{t('recipes.steps')}</Text>
                {comp.steps.map((step, si) =>
                  editing ? (
                    <View key={si} style={styles.previewStepEditRow}>
                      <Text style={styles.previewStepNum}>{si + 1}.</Text>
                      <TextInput
                        style={styles.previewStepInput}
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
                  ) : (
                    <View key={si} style={styles.previewStepRow}>
                      <Text style={styles.previewStepNum}>{si + 1}.</Text>
                      <Text style={styles.previewStepText}>{step}</Text>
                    </View>
                  ),
                )}
                {editing && (
                  <Pressable
                    style={({ pressed }) => [styles.addRowBtn, pressed && { opacity: 0.7 }]}
                    onPress={() => addStep(ci)}
                    accessibilityLabel={t('addRecipe.addStep')}
                  >
                    <Text style={styles.addRowBtnText}>+ {t('addRecipe.addStep')}</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        ))}
      </View>
    </View>
  )
}

// ── QuickUrlInputRow ───────────────────────────────────────────────────────────

const QuickUrlInputRow = ({
  url,
  onUrlChange,
  onPaste,
  onImport,
}: {
  url: string
  onUrlChange: (v: string) => void
  onPaste: () => void
  onImport: () => void
}) => {
  const { t } = useTranslation()
  return (
    <View style={styles.quickUrlSection}>
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
          returnKeyType="go"
          onSubmitEditing={onImport}
          accessibilityLabel={t('addRecipe.recipeUrl')}
          textContentType="URL"
        />
        <Pressable
          style={({ pressed }) => [styles.pasteIconBtn, pressed && { opacity: 0.7 }]}
          onPress={onPaste}
          accessibilityLabel={t('addRecipe.paste')}
          hitSlop={8}
        >
          <Feather name="clipboard" size={20} color={colors.secondaryLabel} />
        </Pressable>
      </View>
      <Pressable
        style={({ pressed }) => [styles.primaryBtn, !url.trim() && styles.btnDisabled, pressed && { opacity: 0.7 }]}
        onPress={onImport}
        disabled={!url.trim()}
        accessibilityLabel={t('addRecipe.import')}
      >
        <Text style={styles.primaryBtnText}>{t('addRecipe.import')}</Text>
      </Pressable>
    </View>
  )
}

// ── MethodPickerView ───────────────────────────────────────────────────────────

type FeatherIconName = ComponentProps<typeof Feather>['name']

const METHODS: { key: ImportMode; icon: FeatherIconName; titleKey: string; descKey: string }[] = [
  { key: 'camera', icon: 'camera', titleKey: 'addRecipe.methodCamera', descKey: 'addRecipe.methodCameraDesc' },
  { key: 'gallery', icon: 'image', titleKey: 'addRecipe.methodGallery', descKey: 'addRecipe.methodGalleryDesc' },
  { key: 'text', icon: 'clipboard', titleKey: 'addRecipe.methodText', descKey: 'addRecipe.methodTextDesc' },
  { key: 'scratch', icon: 'edit-3', titleKey: 'addRecipe.methodScratch', descKey: 'addRecipe.methodScratchDesc' },
]

const MethodPickerView = ({ onSelect }: { onSelect: (mode: ImportMode) => void }) => {
  const { t } = useTranslation()
  return (
    <View style={styles.pickerWrap}>
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
            <View style={styles.methodIconWrap}>
              <Feather name={method.icon} size={20} color={colors.blue} />
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
}: {
  url: string
  onUrlChange: (v: string) => void
  onPaste: () => void
  onImport: () => void
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
          returnKeyType="go"
          onSubmitEditing={onImport}
          accessibilityLabel={t('addRecipe.recipeUrl')}
          textContentType="URL"
        />
        <Pressable
          style={({ pressed }) => [styles.pasteIconBtn, pressed && { opacity: 0.7 }]}
          onPress={onPaste}
          accessibilityLabel={t('addRecipe.paste')}
          hitSlop={4}
        >
          <Feather name="clipboard" size={20} color={colors.secondaryLabel} />
        </Pressable>
      </View>
    </View>
  )
}

// ── TextPasteView ──────────────────────────────────────────────────────────────

const TextPasteView = ({
  text,
  onTextChange,
  onPaste,
  onExtract,
}: {
  text: string
  onTextChange: (v: string) => void
  onPaste: () => void
  onExtract: () => void
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
          autoCapitalize="sentences"
          autoCorrect
          accessibilityLabel={t('addRecipe.methodText')}
        />
        <Pressable
          style={({ pressed }) => [styles.textPasteInlineBtn, pressed && { opacity: 0.7 }]}
          onPress={onPaste}
          accessibilityLabel={t('addRecipe.paste')}
        >
          <Feather name="clipboard" size={16} color={PlatformColor('systemBlue') as unknown as string} />
          <Text style={styles.textPasteBtnText}>{t('addRecipe.paste')}</Text>
        </Pressable>
      </View>
    </View>
  )
}

// ── ShareView ──────────────────────────────────────────────────────────────────

const ShareView = ({
  url,
  onUrlChange,
  onPaste,
  onImport,
}: {
  url: string
  onUrlChange: (v: string) => void
  onPaste: () => void
  onImport: () => void
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
          returnKeyType="go"
          onSubmitEditing={onImport}
          accessibilityLabel={t('addRecipe.shareUrlLabel')}
          textContentType="URL"
        />
        <Pressable
          style={({ pressed }) => [styles.pasteBtn, pressed && { opacity: 0.7 }]}
          onPress={onPaste}
          accessibilityLabel={t('addRecipe.paste')}
          hitSlop={4}
        >
          <Text style={styles.pasteBtnText}>{t('addRecipe.paste')}</Text>
        </Pressable>
      </View>
    </View>
  )
}

// ── ImportRecipeScreen ─────────────────────────────────────────────────────────

const ImportRecipeScreen = () => {
  const { type: sharedTypeParam, value: sharedValueParam } = useLocalSearchParams<{ type?: string; value?: string }>()
  const navigation = useNavigation()
  const router = useRouter()
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const api = useApiClient()
  const qc = useQueryClient()
  const { push: pushNotif } = useNotificationHistory()
  const { tags, create: createTagMutation } = useTags()
  const { preferences } = usePreferences()

  const [mode, setMode] = useState<ImportMode | null>(null)
  const [url, setUrl] = useState('')
  const [pastedText, setPastedText] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const progressAnim = useRef(new Animated.Value(0)).current
  const [editable, setEditable] = useState<EditableRecipe | null>(null)
  const [previewMode, setPreviewMode] = useState(false)
  const [selectedTags, setSelectedTags] = useState<Tag[]>([])
  const [error, setError] = useState<string | null>(null)
  const cancelRef = useRef<(() => void) | null>(null)
  const skipGuardRef = useRef(false)
  const pendingThumbRef = useRef<string | null>(null)
  // High demand background job state
  const highDemandJobRef = useRef<{ kind: ImportJobKind; input: Record<string, string> } | null>(null)
  const highDemandOfferedRef = useRef(false)

  const activeAllergens = useMemo(() => {
    const p = preferences?.personal_allergens
    return p ? [...(p.predefined ?? []), ...(p.custom ?? [])] : []
  }, [preferences])

  const autoSubstitute = preferences?.auto_substitute ?? false

  useEffect(() => () => { cancelRef.current?.() }, [])

  // Handle content shared from the native Share Extension via deep link params
  useEffect(() => {
    if (!sharedTypeParam || !sharedValueParam || editable) return
    switch (sharedTypeParam) {
      case 'url':   setMode('share'); setUrl(sharedValueParam); break
      case 'text':  setMode('text'); setPastedText(sharedValueParam); break
      case 'image': setMode('gallery'); startImageImport(sharedValueParam, 'image/jpeg'); break
    }
  }, [sharedTypeParam, sharedValueParam])

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

  const renderBackButton = useCallback(
    (onPress: () => void) => () => (
      <Pressable
        onPress={onPress}
        hitSlop={8}
        style={({ pressed }) => [styles.headerBackBtnWrap, pressed && { opacity: 0.5 }]}
        accessibilityLabel={t('common.back')}
      >
        <Feather name="chevron-left" size={24} color={PlatformColor('label') as unknown as string} style={styles.headerBackChevron} />
        <Text style={styles.headerBackBtn}>{t('common.back')}</Text>
      </Pressable>
    ),
    [t],
  )

  useLayoutEffect(() => {
    if (editable) {
      navigation.setOptions({
        gestureEnabled: false,
        headerTransparent: true,
        headerTitle: '',
        headerShadowVisible: false,
        headerLeft: renderBackButton(() => {
          if (!previewMode && mode !== 'scratch') {
            setPreviewMode(true)
            return
          }
          if (isBlankRecipe(editable)) {
            reset()
            setMode(null)
            return
          }
          Alert.alert(t('addRecipe.discard'), t('addRecipe.discardMessage'), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('addRecipe.discard'), style: 'destructive', onPress: () => { reset(); setMode(null) } },
          ])
        }),
        headerRight: previewMode
          ? () => (
              <Pressable
                onPress={() => setPreviewMode(false)}
                hitSlop={8}
                style={({ pressed }) => [styles.headerEditBtn, pressed && { opacity: 0.5 }]}
                accessibilityLabel={t('common.edit')}
                accessibilityRole="button"
              >
                <Feather name="edit-2" size={22} color={PlatformColor('secondaryLabel') as unknown as string} />
              </Pressable>
            )
          : () => <BugReportButton />,
      })
    } else if (mode) {
      navigation.setOptions({
        gestureEnabled: true,
        headerTransparent: false,
        headerTitle: t('addRecipe.addRecipe'),
        headerShadowVisible: false,
        headerLeft: renderBackButton(() => {
          reset()
          if (loading) {
            navigation.goBack()
          } else {
            setMode(null)
          }
        }),
        headerRight: () => <BugReportButton />,
      })
    } else {
      navigation.setOptions({
        gestureEnabled: true,
        headerTransparent: false,
        headerTitle: t('addRecipe.addRecipe'),
        headerShadowVisible: false,
        headerLeft: renderBackButton(() => navigation.goBack()),
        headerRight: () => <BugReportButton />,
      })
    }
  }, [navigation, mode, editable, previewMode, loading, t, renderBackButton])

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
    progressAnim.setValue(0)
    setEditable(null)
    setPreviewMode(false)
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
      setPreviewMode(true)
      setSelectedTags(
        tags.filter((tag) =>
          editableRecipe.suggestedTagNames.some((name) => name.toLowerCase() === tag.name.toLowerCase()),
        ),
      )
    } else {
      const message =
        res.error === 'extraction_failed' || !res.error
          ? t('addRecipe.couldNotExtract')
          : res.error
      // Camera/gallery imports leave the user looking at a blank import screen with no
      // input to correct (unlike a URL/text typo), so a passive inline error is easy to
      // miss — surface it as an alert too.
      if (mode === 'camera' || mode === 'gallery') {
        Alert.alert(t('addRecipe.importFailed'), message)
      }
      setError(message)
    }
    setLoading(false)
  }

  const handleHighDemand = useCallback(async () => {
    if (highDemandOfferedRef.current || !highDemandJobRef.current) return
    highDemandOfferedRef.current = true

    const job = highDemandJobRef.current

    Alert.alert(
      t('addRecipe.highDemandTitle'),
      t('addRecipe.highDemandMessage'),
      [
        { text: t('addRecipe.highDemandWait'), style: 'cancel' },
        {
          text: t('addRecipe.highDemandAccept'),
          onPress: async () => {
            // Abort the foreground stream
            cancelRef.current?.()
            setLoading(false)
            progressAnim.setValue(0)

            // Get device push token for fallback notification
            let devicePushToken: string | null = null
            try {
              const tokenData = await Notifications.getDevicePushTokenAsync()
              devicePushToken = tokenData.data
            } catch {
              // Push token unavailable — job will run silently
            }

            try {
              const enqueued = await api.enqueueImportJob({
                kind: job.kind,
                input: job.input,
                device_push_token: devicePushToken,
              })
              pushNotif({
                type: 'recipe_importing',
                title: t('bell.recipeImporting'),
                body: t('bell.recipeImportingBody'),
                job_id: enqueued.id,
                job_kind: job.kind,
                job_input: job.input,
              })
              skipGuardRef.current = true
              router.back()
            } catch (err) {
              setError(err instanceof Error ? err.message : t('addRecipe.failedToEnqueueJob'))
              setLoading(false)
            }
          },
        },
      ],
    )
  }, [api, pushNotif, router, t])

  const startStreamCallbacks = () => ({
    onStage(stage: StageEvent) {
      console.log('[import] stage:', stage.key, '—', stage.label)
      const target = STAGE_PROGRESS[stage.key] ?? 0.5
      Animated.timing(progressAnim, { toValue: target, duration: 400, useNativeDriver: false }).start()
    },
    onDone(res: ImportResult) {
      console.log('[import] done:', res.stage, res.error ?? 'ok')
      Animated.timing(progressAnim, { toValue: 1, duration: 300, useNativeDriver: false }).start()
      applyImportResult(res)
    },
    onError(msg: string) {
      console.log('[import] error:', msg)
      setError(msg)
      setLoading(false)
    },
    onHighDemand() {
      console.log('[import] high demand — offering background job')
      void handleHighDemand()
    },
  })

  const handleImportUrl = () => {
    if (!url.trim()) return
    cancelRef.current?.()
    highDemandJobRef.current = { kind: 'url', input: { url: url.trim() } }
    highDemandOfferedRef.current = false
    progressAnim.setValue(0)
    setLoading(true)
    setError(null)
    setEditable(null)
    setSelectedTags([])
    cancelRef.current = api.streamImportFetch(url.trim(), startStreamCallbacks())
  }

  const handleQuickUrlImport = () => {
    if (!url.trim()) return
    setMode('url')
    handleImportUrl()
  }

  const handleImportText = () => {
    if (!pastedText.trim()) return
    cancelRef.current?.()
    highDemandJobRef.current = { kind: 'text', input: { text: pastedText.trim() } }
    highDemandOfferedRef.current = false
    progressAnim.setValue(0)
    setLoading(true)
    setError(null)
    setEditable(null)
    setSelectedTags([])
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
      setMode(null)
      return
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      base64: true,
    })
    if (!result.canceled && result.assets[0]?.base64) {
      startImageImport(result.assets[0].base64, result.assets[0].mimeType ?? 'image/jpeg')
    } else if (result.canceled) {
      setMode(null)
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
      setMode(null)
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      base64: true,
    })
    if (!result.canceled && result.assets[0]?.base64) {
      startImageImport(result.assets[0].base64, result.assets[0].mimeType ?? 'image/jpeg')
    } else if (result.canceled) {
      setMode(null)
    }
  }

  const startImageImport = (imageBase64: string, mimeType: string) => {
    cancelRef.current?.()
    highDemandJobRef.current = { kind: 'image', input: { image_base64: imageBase64, mime_type: mimeType } }
    highDemandOfferedRef.current = false
    pendingThumbRef.current = `data:${mimeType};base64,${imageBase64}`
    progressAnim.setValue(0)
    setLoading(true)
    setError(null)
    setEditable(null)
    setSelectedTags([])
    cancelRef.current = api.streamImageImportFetch(imageBase64, mimeType, startStreamCallbacks())
  }

  const handleModeSelect = (selectedMode: ImportMode) => {
    reset()
    setMode(selectedMode)
    switch (selectedMode) {
      case 'camera':  handleCamera(); break
      case 'gallery': handleGallery(); break
      case 'scratch': setEditable(blankRecipe()); setPreviewMode(false); break
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
        protein_per_serving: editable.protein !== '' ? Number(editable.protein) : null,
        fat_per_serving: editable.fat !== '' ? Number(editable.fat) : null,
        carbs_per_serving: editable.carbs !== '' ? Number(editable.carbs) : null,
        thumbnail_url: editable.thumbnail_url,
        creator_handle: editable.creator_handle,
        source_url: editable.source_url,
        debug_model: editable.debug?.model ?? null,
        debug_input_tokens: editable.debug?.input_tokens ?? null,
        debug_output_tokens: editable.debug?.output_tokens ?? null,
        debug_total_tokens: editable.debug?.total_tokens ?? null,
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
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
        contentInsetAdjustmentBehavior={editable ? 'never' : 'automatic'}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!(loading && !editable)}
      >
        {/* Picker — shown when no mode selected and no editable */}
        {!mode && !editable && (
          <>
            <QuickUrlInputRow
              url={url}
              onUrlChange={setUrl}
              onPaste={handlePasteUrl}
              onImport={handleQuickUrlImport}
            />
            <MethodPickerView onSelect={handleModeSelect} />
          </>
        )}

        {/* URL import */}
        {mode === 'url' && !editable && !loading && (
          <UrlInputView
            url={url}
            onUrlChange={setUrl}
            onPaste={handlePasteUrl}
            onImport={handleImportUrl}
          />
        )}

        {/* Text paste */}
        {mode === 'text' && !editable && !loading && (
          <TextPasteView
            text={pastedText}
            onTextChange={setPastedText}
            onPaste={handlePasteText}
            onExtract={handleImportText}
          />
        )}

        {/* Share */}
        {mode === 'share' && !editable && !loading && (
          <ShareView
            url={url}
            onUrlChange={setUrl}
            onPaste={handlePasteUrl}
            onImport={handleImportUrl}
          />
        )}

        {/* Camera/Gallery: brief wait for the native picker before the stream starts */}
        {(mode === 'camera' || mode === 'gallery') && !editable && !loading && (
          <View style={styles.imageLoadingSection}>
            <Ionicons name="image" size={80} color={PlatformColor('tertiaryLabel') as unknown as string} />
          </View>
        )}

        {/* Import in progress — skeleton preview of the recipe detail layout */}
        {loading && !editable && <RecipeImportSkeleton progress={progressAnim} />}

        {/* Imported recipe view — read-only preview or in-place edit form */}
        {editable && (
          <RecipeFormView
            recipe={editable}
            editing={!previewMode}
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
            {(mode === 'url' || mode === 'share') && url.trim() && (
              <Pressable
                style={({ pressed }) => [styles.openInBrowserBtn, pressed && { opacity: 0.7 }]}
                onPress={() => router.push({ pathname: '/webview-import', params: { url: url.trim() } })}
                accessibilityLabel={t('addRecipe.openInBrowser')}
              >
                <Text style={styles.openInBrowserText}>{t('addRecipe.openInBrowser')}</Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>

      {/* Action bar */}
      {(editable || showImportBtn || showImportShareBtn || showExtractBtn) && (
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
  headerBackBtnWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: -8,
    paddingHorizontal: 4,
  },
  headerBackChevron: { marginRight: -4 },
  headerBackBtn: {
    fontSize: 17,
    color: PlatformColor('label') as unknown as string,
  },
  headerEditBtn: { paddingHorizontal: 8, paddingVertical: 4 },

  // Quick URL input
  quickUrlSection: { paddingTop: 8, paddingHorizontal: 16, gap: 10 },

  // Method picker
  pickerWrap: { paddingTop: 16, paddingHorizontal: 16, gap: 12 },
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
    backgroundColor: PlatformColor('systemGray5') as unknown as string,
  },
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
  imageLoadingSection: { padding: 16, gap: 16, alignItems: 'center', paddingTop: 60 },

  // URL input
  urlInputGroup: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  urlInput: {
    flex: 1,
    height: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PlatformColor('opaqueSeparator') as unknown as string,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    backgroundColor: PlatformColor('systemBackground') as unknown as string,
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
  pasteIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PlatformColor('opaqueSeparator') as unknown as string,
    backgroundColor: PlatformColor('systemBackground') as unknown as string,
    alignItems: 'center',
    justifyContent: 'center',
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
    backgroundColor: PlatformColor('systemBackground') as unknown as string,
    color: PlatformColor('label') as unknown as string,
    minHeight: 200,
    textAlignVertical: 'top',
  },
  textPasteInlineBtn: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: PlatformColor('secondarySystemBackground') as unknown as string,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PlatformColor('opaqueSeparator') as unknown as string,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  textPasteBtnText: {
    fontSize: 16,
    color: PlatformColor('systemBlue') as unknown as string,
    fontWeight: '500',
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

  // Import skeleton
  skeletonBone: {
    backgroundColor: PlatformColor('systemGray5') as unknown as string,
    borderRadius: 6,
  },
  skeletonTitleLine: { height: 26, borderRadius: 8, marginBottom: 8 },
  skeletonTag: { height: 22, borderRadius: 12 },
  skeletonMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  skeletonMetaBox: {
    backgroundColor: colors.secondaryBackground,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    minWidth: 64,
    gap: 4,
  },
  skeletonMetaNumber: { width: 28, height: 17, borderRadius: 5 },
  skeletonMetaLabel: { width: 40, height: 13, borderRadius: 4 },
  skeletonLabel: { width: 90, height: 12, borderRadius: 4, marginBottom: 10 },
  skeletonBullet: { width: 6, height: 6, borderRadius: 3, marginRight: 8, marginTop: 8 },
  skeletonIngredientLine: { height: 17, borderRadius: 5 },
  skeletonStepNum: { width: 20, height: 17, borderRadius: 5, marginRight: 8 },
  skeletonStepLine: { height: 17, borderRadius: 5 },
  skeletonHeroWrap: { alignItems: 'center', justifyContent: 'center' },
  skeletonProgressCard: {
    width: 88,
    height: 88,
    borderRadius: 22,
    backgroundColor: PlatformColor('systemBackground') as unknown as string,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  skeletonProgressTrack: {
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: PlatformColor('systemGray5') as unknown as string,
    overflow: 'hidden',
  },
  skeletonProgressFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.brand,
  },

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
  openInBrowserBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.brand,
  },
  openInBrowserText: { fontSize: 13, fontWeight: '600', color: colors.background },

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
    backgroundColor: colors.blue,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  primaryBtnText: { fontSize: 16, color: '#fff', fontWeight: '600' },
  btnDisabled: { opacity: 0.4 },

  // Read-only import preview (mirrors saved-recipe detail screen)
  previewHeroImage: { width: '100%', aspectRatio: 4 / 3 },
  previewCard: { paddingHorizontal: 16, paddingTop: 20 },
  previewTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: PlatformColor('label') as unknown as string,
    marginBottom: 10,
    lineHeight: 34,
  },
  previewTagRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12, gap: 6 },
  previewTag: {
    backgroundColor: colors.brandLight,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  previewTagText: { color: colors.brand, fontSize: 12, fontWeight: '500' },
  previewSourceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  previewSourceText: { fontSize: 13, color: PlatformColor('secondaryLabel') as unknown as string },
  previewComponentBlock: { marginTop: 8 },
  previewComponentName: {
    fontSize: 20,
    fontWeight: '600',
    color: PlatformColor('label') as unknown as string,
    marginBottom: 12,
    lineHeight: 25,
  },
  previewSection: { marginBottom: 16 },
  previewSectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: PlatformColor('secondaryLabel') as unknown as string,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  previewIngredientRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  previewBullet: { color: PlatformColor('tertiaryLabel') as unknown as string, marginRight: 8, marginTop: 1 },
  previewIngredientText: {
    flex: 1,
    fontSize: 17,
    color: PlatformColor('label') as unknown as string,
    lineHeight: 22,
  },
  previewStepRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  previewStepNum: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.blue,
    width: 28,
    marginTop: 1,
  },
  previewStepText: {
    flex: 1,
    fontSize: 17,
    color: PlatformColor('label') as unknown as string,
    lineHeight: 22,
  },

  // Edit-mode variants of the preview above (same layout, editable fields)
  previewHeroPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: PlatformColor('secondarySystemBackground') as unknown as string,
  },
  previewHeroPlaceholderText: { fontSize: 13, color: PlatformColor('secondaryLabel') as unknown as string },
  previewHeroEditBtn: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  previewHeroEditText: { fontSize: 12, color: '#ffffff', fontWeight: '600' },
  previewTitleInput: {
    borderBottomWidth: 1,
    borderColor: PlatformColor('opaqueSeparator') as unknown as string,
    paddingBottom: 4,
  },
  previewAddTagBtn: {
    borderWidth: 1,
    borderColor: PlatformColor('opaqueSeparator') as unknown as string,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  previewAddTagText: { fontSize: 12, color: PlatformColor('secondaryLabel') as unknown as string },
  previewStepEditRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 8 },
  previewStepInput: {
    flex: 1,
    fontSize: 17,
    color: PlatformColor('label') as unknown as string,
    lineHeight: 22,
    borderBottomWidth: 1,
    borderColor: PlatformColor('opaqueSeparator') as unknown as string,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },

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
