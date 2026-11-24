import { useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { checkedStorageKey } from './helpers'

const EMPTY_KEYS: string[] = []

const readCheckedKeys = async (recipeId: string): Promise<string[]> => {
  const value = await AsyncStorage.getItem(checkedStorageKey(recipeId))
  if (!value) return EMPTY_KEYS

  try {
    const parsed: unknown = JSON.parse(value)

    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : EMPTY_KEYS
  } catch {
    return EMPTY_KEYS
  }
}

const useCheckedIngredients = (recipeId: string) => {
  const queryClient = useQueryClient()
  const queryKey = useMemo(() => ['cook-checked', recipeId], [recipeId])

  const { data = EMPTY_KEYS } = useQuery({
    queryKey,
    queryFn: () => readCheckedKeys(recipeId),
    staleTime: Infinity,
  })

  const checked = useMemo(() => new Set(data), [data])

  const toggle = useCallback(
    (key: string) => {
      const current = new Set(queryClient.getQueryData<string[]>(queryKey) ?? EMPTY_KEYS)
      if (!current.delete(key)) current.add(key)

      const next = [...current]
      queryClient.setQueryData(queryKey, next)
      void AsyncStorage.setItem(checkedStorageKey(recipeId), JSON.stringify(next))
    },
    [queryClient, queryKey, recipeId],
  )

  return { checked, toggle }
}

export default useCheckedIngredients
