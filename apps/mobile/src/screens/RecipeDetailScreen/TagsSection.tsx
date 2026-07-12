import { useCallback, useMemo, useState } from 'react'
import { Alert, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useTags } from '@carrot/shared/hooks/useTags'
import type { RecipeOut, Tag } from '@carrot/shared/types'
import { tTag } from '@carrot/shared/utils/tagUtils'
import { TagPickerModal } from '../../components/RecipeFieldEditors'
import { styles } from './styles'

const TagsSection = ({ recipe, editing }: { recipe: RecipeOut; editing: boolean }) => {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { tags: allTags, create: createTagMutation, addToRecipe, removeFromRecipe } = useTags()
  const [showTagPicker, setShowTagPicker] = useState(false)

  const selectedIds = useMemo(() => new Set(recipe.tags.map((tag) => tag.id)), [recipe.tags])

  const patchRecipeTags = useCallback(
    (updater: (tags: Tag[]) => Tag[]) => {
      qc.setQueryData<RecipeOut[]>(['recipes'], (prev) =>
        prev ? prev.map((r) => (r.id === recipe.id ? { ...r, tags: updater(r.tags) } : r)) : prev,
      )
    },
    [qc, recipe.id],
  )

  const handleTagAdd = useCallback(
    async (tag: Tag) => {
      patchRecipeTags((tags) => [...tags, tag])
      try {
        await addToRecipe.mutateAsync({ recipeId: recipe.id, tagId: tag.id })
      } catch {
        patchRecipeTags((tags) => tags.filter((t) => t.id !== tag.id))
        Alert.alert(t('common.ok'), t('addRecipe.saveError'))
      }
    },
    [patchRecipeTags, addToRecipe, recipe.id, t],
  )

  const handleTagRemove = useCallback(
    async (tagId: string) => {
      const removedTag = recipe.tags.find((tag) => tag.id === tagId)
      patchRecipeTags((tags) => tags.filter((tag) => tag.id !== tagId))
      try {
        await removeFromRecipe.mutateAsync({ recipeId: recipe.id, tagId })
      } catch {
        if (removedTag) patchRecipeTags((tags) => [...tags, removedTag])
        Alert.alert(t('common.ok'), t('addRecipe.saveError'))
      }
    },
    [patchRecipeTags, removeFromRecipe, recipe.id, recipe.tags, t],
  )

  const handleTagCreate = useCallback(async (name: string): Promise<Tag> => createTagMutation.mutateAsync(name), [createTagMutation])

  return (
    <>
      <View style={styles.tagRow}>
        {recipe.tags.map((tag) => (
          <Pressable
            key={tag.id}
            style={({ pressed }) => [styles.tag, pressed && { opacity: 0.7 }]}
            onPress={editing ? () => handleTagRemove(tag.id) : undefined}
            accessibilityLabel={editing ? `${tag.name}, tap to remove` : tag.name}
            disabled={!editing}
          >
            <Text style={styles.tagText}>
              {tTag(tag.name, t)}
              {editing && ' ×'}
            </Text>
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
      <TagPickerModal
        visible={showTagPicker}
        allTags={allTags}
        selectedIds={selectedIds}
        onAdd={handleTagAdd}
        onRemove={editing ? handleTagRemove : undefined}
        onCreate={handleTagCreate}
        onClose={() => setShowTagPicker(false)}
      />
    </>
  )
}

export default TagsSection
