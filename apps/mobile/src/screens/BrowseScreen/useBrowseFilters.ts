import { useCallback, useEffect, useState } from 'react'
import { useLocalSearchParams, usePathname, useRouter } from 'expo-router'
import { DEFAULT_FILTERS, PRESET_FILTERS, isBrowsePreset, type BrowseFilters, type SortMode } from './helpers'

const OTHER_TAB_PATHS = ['/home', '/meal-plan', '/shopping', '/settings']

const isOtherTabPath = (pathname: string) =>
  OTHER_TAB_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))

// "See all" on Home opens Browse with temporary filters that are dropped on the next tab switch,
// so the user's own filters come back untouched.
export const useBrowseFilters = (onPresetApplied: () => void) => {
  const router = useRouter()
  const pathname = usePathname()
  const { preset, presetAt } = useLocalSearchParams<{ preset?: string; presetAt?: string }>()
  const [savedFilters, setSavedFilters] = useState<BrowseFilters>(DEFAULT_FILTERS)
  const [presetFilters, setPresetFilters] = useState<BrowseFilters | null>(null)
  const isPresetActive = presetFilters !== null

  useEffect(() => {
    if (isOtherTabPath(pathname)) setPresetFilters(null)
  }, [pathname])

  useEffect(() => {
    if (!presetAt || !isBrowsePreset(preset)) return

    setPresetFilters(PRESET_FILTERS[preset])
    onPresetApplied()
    router.setParams({ preset: undefined, presetAt: undefined })
  }, [preset, presetAt, onPresetApplied, router])

  const updateFilters = useCallback(
    (update: (current: BrowseFilters) => BrowseFilters) => {
      if (isPresetActive) setPresetFilters((current) => current && update(current))
      else setSavedFilters(update)
    },
    [isPresetActive],
  )

  const setSort = useCallback((sort: SortMode) => updateFilters((current) => ({ ...current, sort })), [updateFilters])

  const toggleTag = useCallback(
    (tagId: string) =>
      updateFilters((current) => {
        const tagIds = new Set(current.tagIds)
        if (tagIds.has(tagId)) tagIds.delete(tagId)
        else tagIds.add(tagId)

        return { ...current, tagIds }
      }),
    [updateFilters],
  )

  const toggleFavourites = useCallback(
    () => updateFilters((current) => ({ ...current, favouritesOnly: !current.favouritesOnly })),
    [updateFilters],
  )

  const clearFilters = useCallback(
    () => updateFilters((current) => ({ ...current, tagIds: new Set(), favouritesOnly: false })),
    [updateFilters],
  )

  return {
    filters: presetFilters ?? savedFilters,
    setSort,
    toggleTag,
    toggleFavourites,
    clearFilters,
  }
}
