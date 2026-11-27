import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { withTiming } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { DEFAULT_SHOPPING_CATEGORIES, type ShoppingCategory } from '@carrot/shared/types'
import { useHousehold } from '../../context/HouseholdContext'
import { createCategoryValues, type CategoryValues, type CollapsedCategories } from './helpers'
import { AISLE_SLIDE_EASING, AISLE_SLIDE_MS } from './motion'

interface UseAisleCollapseParams {
  instant: boolean
  measurePausedRef: RefObject<boolean>
  onSettled: () => void
}

// Measuring is paused while aisles slide: every card below moves each frame, and drag re-measures on touch anyway.
export const useAisleCollapse = ({ instant, measurePausedRef, onSettled }: UseAisleCollapseParams) => {
  const { activeHouseholdId } = useHousehold()
  const [collapsedCategories, setCollapsedCategories] = useState<CollapsedCategories>({})
  const [ready, setReady] = useState(false)
  const [sliding, setSliding] = useState<ReadonlySet<ShoppingCategory>>(() => new Set())
  const collapsedRef = useRef<CollapsedCategories>({})
  const progressRef = useRef<CategoryValues | null>(null)
  const tokensRef = useRef(new Map<ShoppingCategory, number>())
  const inFlightRef = useRef(new Set<ShoppingCategory>())
  const storageKey = activeHouseholdId ? `shopping-list-collapsed-categories:${activeHouseholdId}` : null

  if (!progressRef.current) progressRef.current = createCategoryValues()
  const progress = progressRef.current

  const restore = useCallback((stored: CollapsedCategories) => {
    collapsedRef.current = stored
    setCollapsedCategories(stored)
    DEFAULT_SHOPPING_CATEGORIES.forEach((category) => {
      progress[category].value = stored[category] ? 1 : 0
    })
    setReady(true)
  }, [progress])

  useEffect(() => {
    if (!storageKey) {
      restore({})
      return
    }
    void AsyncStorage.getItem(storageKey)
      .then((value) => restore(value ? JSON.parse(value) : {}))
      .catch(() => restore({}))
  }, [storageKey, restore])

  const finishSlide = useCallback((category: ShoppingCategory, token: number) => {
    if (tokensRef.current.get(category) !== token) return

    inFlightRef.current.delete(category)
    setSliding(new Set(inFlightRef.current))
    if (inFlightRef.current.size > 0) return

    measurePausedRef.current = false
    onSettled()
  }, [measurePausedRef, onSettled])

  const toggleCategory = useCallback((category: ShoppingCategory) => {
    const closing = !collapsedRef.current[category]
    const next = { ...collapsedRef.current, [category]: closing }
    const token = (tokensRef.current.get(category) ?? 0) + 1
    const target = closing ? 1 : 0
    tokensRef.current.set(category, token)

    if (instant) {
      progress[category].value = target
    } else {
      inFlightRef.current.add(category)
      measurePausedRef.current = true
      setSliding(new Set(inFlightRef.current))
      progress[category].value = withTiming(target, { duration: AISLE_SLIDE_MS, easing: AISLE_SLIDE_EASING }, (finished) => {
        'worklet'
        if (finished) scheduleOnRN(finishSlide, category, token)
      })
    }

    collapsedRef.current = next
    setCollapsedCategories(next)
    if (storageKey) void AsyncStorage.setItem(storageKey, JSON.stringify(next))
  }, [storageKey, instant, progress, finishSlide, measurePausedRef])

  return { collapsedCategories, progress, ready, sliding, toggleCategory }
}
