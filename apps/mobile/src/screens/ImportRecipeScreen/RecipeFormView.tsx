import { useCallback, useRef, useState } from 'react'
import { Alert, PlatformColor, Pressable, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import * as ImagePicker from 'expo-image-picker'
import NutritionBoxGrid from '../../components/NutritionBoxGrid'
import { UnitPickerModal, TagPickerModal, IngredientEditor } from '../../components/RecipeFieldEditors'
import type { Tag } from '@carrot/shared/types'
import { parseIngredient, serializeIngredient } from '@carrot/shared/utils/ingredientUtils'
import type { StructuredIngredient } from '@carrot/shared/utils/ingredientUtils'
import { tTag } from '@carrot/shared/utils/tagUtils'
import { uploadThumbnailImage, makeTempRecipeId } from '../../api/uploadThumbnail'
import type { EditableRecipe } from './helpers'
import RecipeHeroImage from './RecipeHeroImage'
import { styles } from './styles'

// Read-only preview and in-place edit form share this one layout so toggling `editing` doesn't jump the UI.
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
  const tempRecipeIdRef = useRef(makeTempRecipeId())

  const handlePickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
      allowsEditing: false,
    })
    if (result.canceled || !result.assets[0]) return

    const asset = result.assets[0]
    setUploadingThumb(true)
    try {
      const data = await uploadThumbnailImage(tempRecipeIdRef.current, asset)
      onChange({ ...recipe, thumbnail_url: data.url })
    } catch {
      Alert.alert(t('common.ok'), t('common.uploadFailed'))
    } finally {
      setUploadingThumb(false)
    }
  }, [recipe, onChange, t])

  const handleReplaceAllergen = useCallback((ci: number, ii: number) => {
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
  }, [recipe, onChange])

  const handleRestoreAllergen = useCallback((ci: number, ii: number) => {
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
  }, [recipe, onChange])

  const setIngredient = useCallback((ci: number, ii: number, val: StructuredIngredient) => {
    onChange({
      ...recipe,
      components: recipe.components.map((c, ci2) =>
        ci2 !== ci ? c : { ...c, ingredients: c.ingredients.map((ing, ii2) => (ii2 === ii ? val : ing)) },
      ),
    })
  }, [recipe, onChange])

  const addIngredient = useCallback((ci: number) => {
    onChange({
      ...recipe,
      components: recipe.components.map((c, ci2) =>
        ci2 !== ci ? c : {
          ...c,
          ingredients: [...c.ingredients, { qty: '', unit: '', name: '' }],
          ingredient_flags: [...c.ingredient_flags, null],
        },
      ),
    })
  }, [recipe, onChange])

  const removeIngredient = useCallback((ci: number, ii: number) => {
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
  }, [recipe, onChange])

  const setStep = useCallback((ci: number, si: number, val: string) => {
    onChange({
      ...recipe,
      components: recipe.components.map((c, ci2) =>
        ci2 !== ci ? c : { ...c, steps: c.steps.map((s, si2) => (si2 === si ? val : s)) },
      ),
    })
  }, [recipe, onChange])

  const addStep = useCallback((ci: number) => {
    onChange({
      ...recipe,
      components: recipe.components.map((c, ci2) =>
        ci2 !== ci ? c : { ...c, steps: [...c.steps, ''] },
      ),
    })
  }, [recipe, onChange])

  const removeStep = useCallback((ci: number, si: number) => {
    const comp = recipe.components[ci]
    if (comp.steps.length <= 1) return
    onChange({
      ...recipe,
      components: recipe.components.map((c, ci2) =>
        ci2 !== ci ? c : { ...c, steps: c.steps.filter((_, idx) => idx !== si) },
      ),
    })
  }, [recipe, onChange])

  const handleNutritionChange = useCallback((index: number, value: string) => {
    const key = (['servings', 'kcal', 'protein', 'fat', 'carbs'] as const)[index]
    onChange({ ...recipe, [key]: value })
  }, [recipe, onChange])

  const handleUnitSelect = useCallback((unit: string) => {
    if (unitPickerTarget == null) return
    setIngredient(unitPickerTarget.ci, unitPickerTarget.ii, {
      ...recipe.components[unitPickerTarget.ci].ingredients[unitPickerTarget.ii],
      unit,
    })
  }, [unitPickerTarget, recipe, setIngredient])

  const currentUnit = unitPickerTarget != null
    ? (recipe.components[unitPickerTarget.ci]?.ingredients[unitPickerTarget.ii]?.unit ?? '')
    : ''

  const emptyHeroSpacerHeight = insets.top + 56

  return (
    <View>
      <RecipeHeroImage
        thumbnailUrl={recipe.thumbnail_url}
        title={recipe.title}
        editing={editing}
        uploadingThumb={uploadingThumb}
        emptySpacerHeight={emptyHeroSpacerHeight}
        onPickImage={handlePickImage}
      />

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
              label: t('recipes.colKcal'),
              value: recipe.kcal,
              accessibilityLabel: t('recipes.kcalPerServing'),
            },
            {
              label: t('recipes.protein'),
              value: recipe.protein,
              accessibilityLabel: t('recipes.proteinPerServing'),
              unit: 'g',
            },
            {
              label: t('recipes.fat'),
              value: recipe.fat,
              accessibilityLabel: t('recipes.fatPerServing'),
              unit: 'g',
            },
            {
              label: t('recipes.carbs'),
              value: recipe.carbs,
              accessibilityLabel: t('recipes.carbsPerServing'),
              unit: 'g',
            },
          ]}
          onChangeValue={handleNutritionChange}
          disclaimerText={t('recipes.nutritionEstimateDisclaimer')}
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
          onSelect={handleUnitSelect}
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

export default RecipeFormView
