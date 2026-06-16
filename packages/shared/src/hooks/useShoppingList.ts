import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '../api/context'
import type { ShoppingListItem } from '../types'

const QUERY_KEY = ['shopping-list'] as const

export const useShoppingList = () => {
  const api = useApiClient()
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: api.listShoppingList,
  })

  const addItems = useMutation({
    mutationFn: (items: string[]) => api.addShoppingListItems(items),
    onMutate: async (items) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY })
      const prev = qc.getQueryData<ShoppingListItem[]>(QUERY_KEY) ?? []
      const maxPos = prev.filter((i) => !i.completed).reduce((m, i) => Math.max(m, i.position), -1)
      const now = new Date().toISOString()
      const optimistic: ShoppingListItem[] = items.map((text, idx) => ({
        id: `temp-${Date.now()}-${idx}`,
        user_id: '',
        household_id: null,
        text,
        completed: false,
        position: maxPos + 1 + idx,
        created_at: now,
        updated_at: now,
      }))
      qc.setQueryData<ShoppingListItem[]>(QUERY_KEY, [...prev, ...optimistic])
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(QUERY_KEY, ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })

  // Pass current completed state explicitly — onMutate runs before mutationFn,
  // so reading from cache inside mutationFn would see the already-flipped value.
  const toggle = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      api.updateShoppingListItem(id, { completed: !completed }),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY })
      const prev = qc.getQueryData<ShoppingListItem[]>(QUERY_KEY) ?? []
      qc.setQueryData<ShoppingListItem[]>(
        QUERY_KEY,
        prev.map((i) => (i.id === id ? { ...i, completed: !i.completed } : i))
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(QUERY_KEY, ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })

  const editText = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      api.updateShoppingListItem(id, { text }),
    onMutate: async ({ id, text }) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY })
      const prev = qc.getQueryData<ShoppingListItem[]>(QUERY_KEY) ?? []
      qc.setQueryData<ShoppingListItem[]>(
        QUERY_KEY,
        prev.map((i) => (i.id === id ? { ...i, text } : i))
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(QUERY_KEY, ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })

  const reorder = useMutation({
    mutationFn: (ids: string[]) => api.reorderShoppingList(ids),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY })
      const prev = qc.getQueryData<ShoppingListItem[]>(QUERY_KEY) ?? []
      const byId = Object.fromEntries(prev.map((i) => [i.id, i]))
      const reordered = ids.map((id, pos) => ({ ...byId[id], position: pos }))
      const completed = prev.filter((i) => i.completed)
      qc.setQueryData<ShoppingListItem[]>(QUERY_KEY, [...reordered, ...completed])
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(QUERY_KEY, ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteShoppingListItem(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY })
      const prev = qc.getQueryData<ShoppingListItem[]>(QUERY_KEY) ?? []
      qc.setQueryData<ShoppingListItem[]>(QUERY_KEY, prev.filter((i) => i.id !== id))
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(QUERY_KEY, ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })

  const clearCompleted = useMutation({
    mutationFn: () => api.clearCompletedShoppingList(),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: QUERY_KEY })
      const prev = qc.getQueryData<ShoppingListItem[]>(QUERY_KEY) ?? []
      qc.setQueryData<ShoppingListItem[]>(QUERY_KEY, prev.filter((i) => !i.completed))
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(QUERY_KEY, ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })

  const items = query.data ?? []
  const incompleteItems = items.filter((i) => !i.completed).sort((a, b) => a.position - b.position)
  const completedItems = items.filter((i) => i.completed).sort((a, b) => a.position - b.position)

  return {
    items,
    incompleteItems,
    completedItems,
    isLoading: query.isLoading,
    error: query.error,
    addItems,
    toggle,
    editText,
    reorder,
    remove,
    clearCompleted,
  }
}
