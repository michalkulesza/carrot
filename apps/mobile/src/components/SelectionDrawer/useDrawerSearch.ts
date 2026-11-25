import { useCallback, useMemo, useState } from 'react'

export const useDrawerSearch = () => {
  const [query, setQuery] = useState('')

  const trimmed = useMemo(() => query.trim(), [query])
  const normalized = useMemo(() => trimmed.toLowerCase(), [trimmed])

  const reset = useCallback(() => setQuery(''), [])

  return { query, setQuery, trimmed, normalized, reset }
}
