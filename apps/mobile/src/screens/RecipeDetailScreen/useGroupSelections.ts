import { useMemo, useRef } from 'react'
import type { IngredientGroup } from './helpers'

export const useGroupSelections = (groups: IngredientGroup[], selectedKeys: Set<string>) => {
  const previousRef = useRef(new Map<string, Set<string>>())

  return useMemo(() => {
    const next = new Map<string, Set<string>>()

    for (const group of groups) {
      const keys = group.entries.filter((entry) => selectedKeys.has(entry.key)).map((entry) => entry.key)
      const previous = previousRef.current.get(group.key)
      const unchanged = previous && previous.size === keys.length && keys.every((key) => previous.has(key))

      next.set(group.key, unchanged ? previous : new Set(keys))
    }

    previousRef.current = next

    return next
  }, [groups, selectedKeys])
}
