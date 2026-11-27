import { memo, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '@carrot/shared/api/context'
import type { RecipeOut } from '@carrot/shared/types'
import NotesEditor from './NotesEditor'
import { buildRecipeSaveRequest } from './helpers'

const NotesSection = ({ recipe }: { recipe: RecipeOut }) => {
  const api = useApiClient()
  const qc = useQueryClient()
  const recipeRef = useRef(recipe)
  recipeRef.current = recipe

  const persistNotes = useCallback(
    async (notes: string) => {
      const current = recipeRef.current
      const updated = await api.updateRecipe(current.id, buildRecipeSaveRequest(current, { notes: notes || null }))
      qc.setQueryData<RecipeOut[]>(['recipes'], (prev) => (prev ? prev.map((r) => (r.id === updated.id ? updated : r)) : prev))
    },
    [api, qc],
  )

  return <NotesEditor notes={recipe.notes ?? null} onSave={persistNotes} />
}

export default memo(NotesSection)
