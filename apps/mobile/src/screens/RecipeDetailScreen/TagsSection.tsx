import { memo, useCallback, useMemo, useState } from 'react'
import { Alert, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useTags } from '@carrot/shared/hooks/useTags'
import type { RecipeOut, Tag } from '@carrot/shared/types'
import { tTag } from '@carrot/shared/utils/tagUtils'
import { TagPickerModal } from '../../components/TagPickerModal'
import { Pill } from '../../components/ui'
import { styles } from './styles'

interface TagItemProps {
  tag: Tag
  editing: boolean
  onRemove: (tagId: string) => void
}

const TagItem = ({ tag, editing, onRemove }: TagItemProps) => {
  const { t } = useTranslation()

  const handleRemove = useCallback(() => onRemove(tag.id), [onRemove, tag.id])
  const label = tTag(tag.name, t)

  if (!editing) return <Pill label={label} size="md" />

  return (
    <Pill
      label={label}
      size="md"
      onRemove={handleRemove}
      removeAccessibilityLabel={t('tags.removeTag', { name: label })}
    />
  )
}

interface TagsRowProps {
  tags: Tag[]
  editing: boolean
  onAdd: (tag: Tag) => void
  onRemove: (tagId: string) => void
}

const TagsRow = ({ tags, editing, onAdd, onRemove }: TagsRowProps) => {
  const { t } = useTranslation()
  const { tags: allTags, create: createTagMutation } = useTags()
  const [showTagPicker, setShowTagPicker] = useState(false)

  const selectedIds = useMemo(() => new Set(tags.map((tag) => tag.id)), [tags])

  const handleTagCreate = useCallback(async (name: string): Promise<Tag> => createTagMutation.mutateAsync(name), [createTagMutation])

  const handleOpenPicker = useCallback(() => setShowTagPicker(true), [])
  const handleClosePicker = useCallback(() => setShowTagPicker(false), [])

  const addTagLabel = editing ? t('tags.addTagShort') : t('tags.addTag')

  return (
    <>
      <View style={styles.tagRow}>
        {tags.map((tag) => (
          <TagItem key={tag.id} tag={tag} editing={editing} onRemove={onRemove} />
        ))}
        <Pill
          label={`+ ${addTagLabel}`}
          tone="neutral"
          size="md"
          onPress={handleOpenPicker}
          accessibilityLabel={t('tags.addTag')}
        />
      </View>
      <TagPickerModal
        visible={showTagPicker}
        allTags={allTags}
        selectedIds={selectedIds}
        onAdd={onAdd}
        onRemove={onRemove}
        onCreate={handleTagCreate}
        onClose={handleClosePicker}
      />
    </>
  )
}

interface TagsSectionProps {
  recipe: RecipeOut
  editing?: boolean
}

const TagsSection = ({ recipe, editing = false }: TagsSectionProps) => {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { addToRecipe, removeFromRecipe } = useTags()

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
        Alert.alert(t('common.somethingWentWrong'), t('addRecipe.saveError'))
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
        Alert.alert(t('common.somethingWentWrong'), t('addRecipe.saveError'))
      }
    },
    [patchRecipeTags, removeFromRecipe, recipe.id, recipe.tags, t],
  )

  return <TagsRow tags={recipe.tags} editing={editing} onAdd={handleTagAdd} onRemove={handleTagRemove} />
}

export const LocalTagsSection = memo(({ tags, onTagsChange }: { tags: Tag[]; onTagsChange: (tags: Tag[]) => void }) => {
  const handleTagAdd = useCallback((tag: Tag) => onTagsChange([...tags, tag]), [tags, onTagsChange])
  const handleTagRemove = useCallback(
    (tagId: string) => onTagsChange(tags.filter((tag) => tag.id !== tagId)),
    [tags, onTagsChange],
  )

  return <TagsRow tags={tags} editing onAdd={handleTagAdd} onRemove={handleTagRemove} />
})

export default memo(TagsSection)
