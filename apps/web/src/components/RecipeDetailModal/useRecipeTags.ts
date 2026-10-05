import { useCallback, useState } from 'react'
import { useTags } from '@carrot/shared/hooks/useTags'
import type { RecipeOut, Tag } from '@carrot/shared/types'
import { addTagToRecipe, removeTagFromRecipe } from '../../api/client'

export const useRecipeTags = (recipe: RecipeOut | null, allTags: Tag[]) => {
  const { create: createTagMutation } = useTags()
  const [localTags, setLocalTags] = useState<Tag[]>([])

  const handleTagCreate = useCallback(
    async (name: string): Promise<Tag> => createTagMutation.mutateAsync(name),
    [createTagMutation]
  )

  const handleTagAdd = async (tag: Tag) => {
    if (!recipe) return
    setLocalTags((prev) => [...prev, tag])
    try {
      await addTagToRecipe(recipe.id, tag.id)
    } catch {
      setLocalTags((prev) => prev.filter((existing) => existing.id !== tag.id))
    }
  }

  const handleTagRemove = async (tagId: string) => {
    if (!recipe) return
    setLocalTags((prev) => prev.filter((tag) => tag.id !== tagId))
    try {
      await removeTagFromRecipe(recipe.id, tagId)
    } catch {
      const removed = allTags.find((tag) => tag.id === tagId)
      if (removed) setLocalTags((prev) => [...prev, removed])
    }
  }

  return {
    localTags,
    setLocalTags,
    handleTagAdd,
    handleTagRemove,
    handleTagCreate,
  }
}
