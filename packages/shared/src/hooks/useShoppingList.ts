import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '../api/context'
import type {
  PresenceUser,
  ShoppingCategory,
  ShoppingCategoryOrders,
  ShoppingListItem,
  ShoppingListItemInput,
} from '../types'

const QUERY_KEY = ['shopping-list'] as const
const KEEPALIVE_INTERVAL_MS = 8_000

let tempIdCounter = 0

const isTemporaryItemId = (id: string) => id.startsWith('temp-')

export const useShoppingList = () => {
  const api = useApiClient()
  const qc = useQueryClient()
  const [presence, setPresence] = useState<PresenceUser[]>([])
  const editingItemIdRef = useRef<string | null>(null)
  const keepaliveRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve())
  const pendingWriteCountRef = useRef(0)
  const latestActionIdRef = useRef(0)
  const temporaryItemIdsRef = useRef<Record<string, string>>({})
  const addContextsRef = useRef(
    new WeakMap<ShoppingListItemInput[], { temporaryIds: string[] }>()
  )

  const enqueueWrite = useCallback(
    <T,>(write: () => Promise<T>) => {
      const queuedWrite = writeQueueRef.current.then(write, write)
      writeQueueRef.current = queuedWrite.then(
        () => undefined,
        () => undefined
      )

      return queuedWrite.finally(() => {
        pendingWriteCountRef.current -= 1
        if (pendingWriteCountRef.current === 0) {
          void qc.invalidateQueries({ queryKey: QUERY_KEY })
        }
      })
    },
    [qc]
  )

  useEffect(() => {
    const cancel = api.subscribeShoppingList(
      (items) => {
        if (pendingWriteCountRef.current === 0) {
          qc.setQueryData<ShoppingListItem[]>(QUERY_KEY, items)
        }
      },
      (users) => setPresence(users)
    )
    return cancel
  }, [api, qc])

  const setEditing = useCallback(
    (itemId: string | null) => {
      editingItemIdRef.current = itemId
      if (keepaliveRef.current) {
        clearInterval(keepaliveRef.current)
        keepaliveRef.current = null
      }
      if (itemId) {
        api.postPresence('start', itemId).catch(() => {})
        keepaliveRef.current = setInterval(() => {
          api.postPresence('keepalive', editingItemIdRef.current).catch(() => {})
        }, KEEPALIVE_INTERVAL_MS)
      } else {
        api.postPresence('stop', null).catch(() => {})
      }
    },
    [api]
  )

  useEffect(() => {
    return () => {
      if (keepaliveRef.current) clearInterval(keepaliveRef.current)
      api.postPresence('stop', null).catch(() => {})
    }
  }, [api])

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: api.listShoppingList,
  })

  const addItems = useMutation({
    mutationFn: (items: ShoppingListItemInput[]) =>
      enqueueWrite(async () => {
        const addedItems = await api.addShoppingListItems(items)
        const context = addContextsRef.current.get(items)
        const temporaryIds = context?.temporaryIds ?? []
        const replacements = addedItems.map((item, index) => [temporaryIds[index], item] as const)

        for (const [temporaryId, item] of replacements) {
          if (temporaryId) temporaryItemIdsRef.current[temporaryId] = item.id
        }

        qc.setQueryData<ShoppingListItem[]>(QUERY_KEY, (current = []) =>
          current.map((item) => {
            const replacement = replacements.find(([temporaryId]) => temporaryId === item.id)?.[1]
            return replacement
              ? { ...replacement, category: item.category, position: item.position }
              : item
          })
        )

        return addedItems
      }),
    onMutate: async (items) => {
      pendingWriteCountRef.current += 1
      const actionId = ++latestActionIdRef.current
      await qc.cancelQueries({ queryKey: QUERY_KEY })
      const previousItems = qc.getQueryData<ShoppingListItem[]>(QUERY_KEY) ?? []
      const nextPositionByCategory: Partial<Record<ShoppingCategory, number>> = {}

      for (const item of previousItems) {
        if (!item.completed) {
          nextPositionByCategory[item.category] = Math.max(
            nextPositionByCategory[item.category] ?? -1,
            item.position + 1
          )
        }
      }

      const now = new Date().toISOString()
      const optimisticItems = items.map((input) => {
        const position = nextPositionByCategory[input.category] ?? 0
        nextPositionByCategory[input.category] = position + 1

        return {
          id: `temp-${Date.now()}-${tempIdCounter++}`,
          user_id: '',
          household_id: null,
          text: input.text,
          category: input.category,
          completed: false,
          position,
          created_at: now,
          updated_at: now,
        }
      })
      const temporaryIds = optimisticItems.map((item) => item.id)

      addContextsRef.current.set(items, { temporaryIds })
      qc.setQueryData<ShoppingListItem[]>(QUERY_KEY, [...previousItems, ...optimisticItems])
      return { actionId, temporaryIds }
    },
    onError: (_error, _items, context) => {
      if (!context) return
      qc.setQueryData<ShoppingListItem[]>(QUERY_KEY, (current = []) =>
        current.filter((item) => !context.temporaryIds.includes(item.id))
      )
    },
  })

  const toggle = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      enqueueWrite(async () => {
        const itemId = temporaryItemIdsRef.current[id] ?? id
        if (isTemporaryItemId(itemId)) {
          throw new Error('The item was not added')
        }
        return api.updateShoppingListItem(itemId, { completed: !completed })
      }),
    onMutate: async ({ id, completed }) => {
      pendingWriteCountRef.current += 1
      const actionId = ++latestActionIdRef.current
      await qc.cancelQueries({ queryKey: QUERY_KEY })
      const previousItems = qc.getQueryData<ShoppingListItem[]>(QUERY_KEY) ?? []
      const previousItem = previousItems.find((item) => item.id === id)
      if (!previousItem) return { actionId, previousItem: null }

      const nextCompleted = !completed
      const nextPosition = previousItems
        .filter(
          (item) =>
            item.id !== id &&
            item.category === previousItem.category &&
            item.completed === nextCompleted
        )
        .reduce((maximum, item) => Math.max(maximum, item.position), -1) + 1

      qc.setQueryData<ShoppingListItem[]>(
        QUERY_KEY,
        previousItems.map((item) =>
          item.id === id ? { ...item, completed: nextCompleted, position: nextPosition } : item
        )
      )
      return { actionId, previousItem }
    },
    onError: (_error, _variables, context) => {
      if (!context?.previousItem || context.actionId !== latestActionIdRef.current) return
      qc.setQueryData<ShoppingListItem[]>(QUERY_KEY, (current = []) =>
        current.map((item) =>
          item.id === context.previousItem.id ? context.previousItem : item
        )
      )
    },
  })

  const reorder = useMutation({
    mutationFn: (categoryOrders: ShoppingCategoryOrders) =>
      enqueueWrite(async () => {
        const resolvedOrders: ShoppingCategoryOrders = {}
        for (const [category, itemIds] of Object.entries(categoryOrders) as [
          ShoppingCategory,
          string[],
        ][]) {
          resolvedOrders[category] = itemIds.flatMap((id) => {
            const resolvedId = temporaryItemIdsRef.current[id] ?? id
            return isTemporaryItemId(resolvedId) ? [] : [resolvedId]
          })
        }
        return api.reorderShoppingList(resolvedOrders)
      }),
    onMutate: async (categoryOrders) => {
      pendingWriteCountRef.current += 1
      const actionId = ++latestActionIdRef.current
      await qc.cancelQueries({ queryKey: QUERY_KEY })
      const previousItems = qc.getQueryData<ShoppingListItem[]>(QUERY_KEY) ?? []
      const orderById = new Map<string, { category: ShoppingCategory; position: number }>()

      for (const [category, itemIds] of Object.entries(categoryOrders) as [
        ShoppingCategory,
        string[],
      ][]) {
        itemIds.forEach((id, position) => orderById.set(id, { category, position }))
      }

      qc.setQueryData<ShoppingListItem[]>(
        QUERY_KEY,
        previousItems.map((item) => {
          const order = orderById.get(item.id)
          return order && !item.completed
            ? { ...item, category: order.category, position: order.position }
            : item
        })
      )
      return { actionId, previousItems }
    },
    onError: (_error, _categoryOrders, context) => {
      if (!context || context.actionId !== latestActionIdRef.current) return
      qc.setQueryData(QUERY_KEY, context.previousItems)
    },
  })

  const editText = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      api.updateShoppingListItem(id, { text }),
    onMutate: async ({ id, text }) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY })
      const previousItems = qc.getQueryData<ShoppingListItem[]>(QUERY_KEY) ?? []
      qc.setQueryData<ShoppingListItem[]>(
        QUERY_KEY,
        previousItems.map((item) => (item.id === id ? { ...item, text } : item))
      )
      return { previousItems }
    },
    onError: (_error, _variables, context) => {
      if (context) qc.setQueryData(QUERY_KEY, context.previousItems)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteShoppingListItem(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY })
      const previousItems = qc.getQueryData<ShoppingListItem[]>(QUERY_KEY) ?? []
      qc.setQueryData<ShoppingListItem[]>(QUERY_KEY, previousItems.filter((item) => item.id !== id))
      return { previousItems }
    },
    onError: (_error, _id, context) => {
      if (context) qc.setQueryData(QUERY_KEY, context.previousItems)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })

  const clearCompleted = useMutation({
    mutationFn: () => api.clearCompletedShoppingList(),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: QUERY_KEY })
      const previousItems = qc.getQueryData<ShoppingListItem[]>(QUERY_KEY) ?? []
      qc.setQueryData<ShoppingListItem[]>(QUERY_KEY, previousItems.filter((item) => !item.completed))
      return { previousItems }
    },
    onError: (_error, _variables, context) => {
      if (context) qc.setQueryData(QUERY_KEY, context.previousItems)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })

  const items = query.data ?? []
  const incompleteItems = items.filter((item) => !item.completed).sort((a, b) => a.position - b.position)
  const completedItems = items.filter((item) => item.completed).sort((a, b) => a.position - b.position)

  return {
    items,
    incompleteItems,
    completedItems,
    isLoading: query.isLoading,
    error: query.error,
    presence,
    setEditing,
    addItems,
    toggle,
    editText,
    reorder,
    remove,
    clearCompleted,
  }
}
