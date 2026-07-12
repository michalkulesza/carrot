import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import NetworkImage from '../../components/NetworkImage'
import { useTranslation } from 'react-i18next'
import { Feather } from '@expo/vector-icons'
import type { EdgeInsets } from 'react-native-safe-area-context'
import type { Tag } from '@carrot/shared/types'
import { tTag } from '@carrot/shared/utils/tagUtils'
import { colors } from '../../theme/colors'
import { UnitPickerModal, TagPickerModal, IngredientEditor } from '../../components/RecipeFieldEditors'
import NutritionBoxGrid from '../../components/NutritionBoxGrid'
import { proxyThumbnailUrl } from '../../api/thumbnailUrl'
import { styles } from './styles'
import type { EditComponent, EditDraft } from './helpers'
import type { useEditDraft } from './useEditDraft'

type EditDraftState = ReturnType<typeof useEditDraft>

const EditView = ({
  draft,
  selectedTags,
  saving,
  allTags,
  insets,
  handlePickThumbnail,
  handleTagAdd,
  handleTagRemove,
  handleTagCreate,
  handleCancelEdit,
  handleSaveEdit,
  handleUnitSelect,
  handleNutritionChange,
  updateComp,
  setIngredient,
  addIngredient,
  removeIngredient,
  setStep,
  addStep,
  removeStep,
  setDraft,
  setThumbErrored,
  setUnitPickerTarget,
  setShowTagPicker,
  uploadingThumb,
  thumbErrored,
  unitPickerTarget,
  showTagPicker,
  currentUnit,
}: {
  draft: EditDraft
  selectedTags: Tag[]
  saving: boolean
  allTags: Tag[]
  insets: EdgeInsets
} & Pick<
  EditDraftState,
  | 'handlePickThumbnail'
  | 'handleTagAdd'
  | 'handleTagRemove'
  | 'handleTagCreate'
  | 'handleCancelEdit'
  | 'handleSaveEdit'
  | 'handleUnitSelect'
  | 'handleNutritionChange'
  | 'updateComp'
  | 'setIngredient'
  | 'addIngredient'
  | 'removeIngredient'
  | 'setStep'
  | 'addStep'
  | 'removeStep'
  | 'setDraft'
  | 'setThumbErrored'
  | 'setUnitPickerTarget'
  | 'setShowTagPicker'
  | 'uploadingThumb'
  | 'thumbErrored'
  | 'unitPickerTarget'
  | 'showTagPicker'
  | 'currentUnit'
>) => {
  const { t } = useTranslation()
  const selectedTagIds = new Set(selectedTags.map((tag) => tag.id))

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={insets.top + 56}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
      >
        {draft.thumbnail_url && !thumbErrored ? (
          <View>
            <NetworkImage
              uri={proxyThumbnailUrl(draft.thumbnail_url)!}
              style={styles.heroImage}
              accessibilityLabel={draft.title}
              recyclingKey={draft.thumbnail_url}
              onError={() => setThumbErrored(true)}
            />
            <Pressable
              style={({ pressed }) => [styles.heroEditBtn, pressed && { opacity: 0.7 }]}
              onPress={handlePickThumbnail}
              disabled={uploadingThumb}
              accessibilityLabel={t('common.changePhoto')}
            >
              {uploadingThumb ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Feather name="camera" size={14} color="#ffffff" />
              )}
              <Text style={styles.heroEditText}>
                {uploadingThumb ? t('common.uploading') : t('common.changePhoto')}
              </Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.heroImage, styles.heroPlaceholder, pressed && { opacity: 0.7 }]}
            onPress={handlePickThumbnail}
            disabled={uploadingThumb}
            accessibilityLabel={t('common.addPhoto')}
          >
            {uploadingThumb ? (
              <ActivityIndicator size="small" />
            ) : (
              <>
                <Feather name="camera" size={28} color={colors.secondaryLabel} />
                <Text style={styles.heroPlaceholderText}>{t('common.addPhoto')}</Text>
              </>
            )}
          </Pressable>
        )}

        <View style={styles.card}>
          <TextInput
            style={[styles.title, styles.titleInput]}
            value={draft.title}
            onChangeText={(v) => setDraft((prev) => prev && { ...prev, title: v })}
            multiline
            accessibilityLabel={t('recipes.colTitle')}
          />

          <View style={styles.tagRow}>
            {selectedTags.map((tag) => (
              <Pressable
                key={tag.id}
                style={({ pressed }) => [styles.tag, pressed && { opacity: 0.7 }]}
                onPress={() => handleTagRemove(tag.id)}
                accessibilityLabel={`${tag.name}, tap to remove`}
              >
                <Text style={styles.tagText}>{tTag(tag.name, t)} ×</Text>
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

          <NutritionBoxGrid
            editing
            items={[
              { label: t('recipes.serves'), value: draft.servings, accessibilityLabel: t('recipes.serves') },
              { label: t('recipes.colKcal'), value: draft.kcal, accessibilityLabel: t('recipes.kcalPerServing') },
              { label: t('recipes.protein'), value: draft.protein, accessibilityLabel: t('recipes.proteinPerServing'), unit: 'g' },
              { label: t('recipes.fat'), value: draft.fat, accessibilityLabel: t('recipes.fatPerServing'), unit: 'g' },
              { label: t('recipes.carbs'), value: draft.carbs, accessibilityLabel: t('recipes.carbsPerServing'), unit: 'g' },
            ]}
            onChangeValue={handleNutritionChange}
            disclaimerText={t('recipes.nutritionEstimateDisclaimer')}
          />

          <TagPickerModal
            visible={showTagPicker}
            allTags={allTags}
            selectedIds={selectedTagIds}
            onAdd={handleTagAdd}
            onRemove={handleTagRemove}
            onCreate={handleTagCreate}
            onClose={() => setShowTagPicker(false)}
          />
          <UnitPickerModal
            visible={unitPickerTarget != null}
            selected={currentUnit}
            onSelect={handleUnitSelect}
            onClose={() => setUnitPickerTarget(null)}
          />

          <View style={styles.notesBlock}>
            <Text style={styles.sectionLabel}>{t('recipes.notes')}</Text>
            <TextInput
              style={[styles.notesText, styles.notesInput]}
              value={draft.notes}
              onChangeText={(v) => setDraft((prev) => prev && { ...prev, notes: v })}
              multiline
              placeholder={t('common.addPrivateNotes')}
              accessibilityLabel={t('recipes.notes')}
            />
          </View>

          {draft.components.map((comp, ci) => (
            <EditComponentBlock
              key={ci}
              comp={comp}
              ci={ci}
              multiComponent={draft.components.length > 1}
              updateComp={updateComp}
              setIngredient={setIngredient}
              addIngredient={addIngredient}
              removeIngredient={removeIngredient}
              setStep={setStep}
              addStep={addStep}
              removeStep={removeStep}
              setUnitPickerTarget={setUnitPickerTarget}
            />
          ))}
        </View>
      </ScrollView>

      <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Pressable
          style={({ pressed }) => [styles.secondaryBtn, styles.flex, pressed && { opacity: 0.7 }]}
          onPress={handleCancelEdit}
          disabled={saving}
          accessibilityLabel={t('common.cancel')}
        >
          <Text style={styles.secondaryBtnText}>{t('common.cancel')}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.primaryBtn, styles.flex, saving && styles.btnDisabled, pressed && { opacity: 0.7 }]}
          onPress={handleSaveEdit}
          disabled={saving}
          accessibilityLabel={t('common.save')}
        >
          {saving ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Text style={styles.primaryBtnText}>{t('common.save')}</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

const EditComponentBlock = ({
  comp,
  ci,
  multiComponent,
  updateComp,
  setIngredient,
  addIngredient,
  removeIngredient,
  setStep,
  addStep,
  removeStep,
  setUnitPickerTarget,
}: {
  comp: EditComponent
  ci: number
  multiComponent: boolean
} & Pick<
  EditDraftState,
  | 'updateComp'
  | 'setIngredient'
  | 'addIngredient'
  | 'removeIngredient'
  | 'setStep'
  | 'addStep'
  | 'removeStep'
  | 'setUnitPickerTarget'
>) => {
  const { t } = useTranslation()

  return (
    <View style={styles.componentBlock}>
      {multiComponent && (
        <TextInput
          style={[styles.componentName, styles.componentNameInput]}
          value={comp.name}
          onChangeText={(v) => updateComp(ci, { name: v })}
          accessibilityLabel={t('settings.nameLabel')}
        />
      )}

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('recipes.sectionIngredients')}</Text>
        {comp.ingredients.map((ing, ii) => (
          <IngredientEditor
            key={ii}
            value={ing}
            flag={null}
            activeAllergens={[]}
            onChange={(v) => setIngredient(ci, ii, v)}
            onUnitPress={() => setUnitPickerTarget({ ci, ii })}
            onReplace={() => {}}
            onRestore={() => {}}
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

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('recipes.steps')}</Text>
        {comp.steps.map((step, si) => (
          <View key={si} style={styles.stepEditRow}>
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
  )
}

export default EditView
