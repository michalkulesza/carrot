import { useRef, useState } from 'react'
import type { RecipeOut, SaveComponent, Tag } from '@carrot/shared/types'
import { updateRecipe } from '../../api/client'
import { buildRecipeUpdateFromRecipe } from './helpers'

export const useRecipeNotes = (
  recipe: RecipeOut | null,
  localTags: Tag[],
  onUpdated?: (recipe: RecipeOut) => void
) => {
  const [localNotes, setLocalNotes] = useState(recipe?.notes ?? '')
  const [notesSaving, setNotesSaving] = useState(false)
  const savedNotesRef = useRef(recipe?.notes ?? '')

  const resetNotes = (notes: string) => {
    setLocalNotes(notes)
    savedNotesRef.current = notes
  }

  const handleNotesSave = async () => {
    if (!recipe) return
    const trimmed = localNotes.trim()
    if (trimmed === savedNotesRef.current.trim()) return
    setNotesSaving(true)
    try {
      const updated = await updateRecipe(
        recipe.id,
        buildRecipeUpdateFromRecipe(recipe, {
          components: recipe.components as SaveComponent[],
          notes: trimmed || null,
          tagIds: localTags.map((tag) => tag.id),
        })
      )
      savedNotesRef.current = trimmed
      onUpdated?.(updated)
    } catch {
      // silent — user can retry by editing again
    } finally {
      setNotesSaving(false)
    }
  }

  return { localNotes, setLocalNotes, notesSaving, resetNotes, handleNotesSave }
}
