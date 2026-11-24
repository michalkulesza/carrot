import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRecentActivityWriters } from '../../hooks/useRecentActivity'
import { checkedStorageKey, findStepIndex, stepStorageKey, type CookStep } from './helpers'

const STEP_LOCK_MS = 260

interface StepOverride {
  jumpKey: string
  index: number
}

interface UseCookSessionArgs {
  recipeId: string
  steps: CookStep[]
  initialComponentIndex: number | null
  initialStepIndex: number | null
  jumpKey: string
}

const readSavedIndex = async (recipeId: string) => {
  const value = await AsyncStorage.getItem(stepStorageKey(recipeId))
  if (!value) return null

  try {
    const saved = JSON.parse(value) as { index?: number }

    return typeof saved.index === 'number' ? saved.index : null
  } catch {
    return null
  }
}

const useCookSession = ({ recipeId, steps, initialComponentIndex, initialStepIndex, jumpKey }: UseCookSessionArgs) => {
  const queryClient = useQueryClient()
  const { setCookSession, clearCookSession } = useRecentActivityWriters()
  const [override, setOverride] = useState<StepOverride | null>(null)
  const lockedRef = useRef(false)
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const finishedRef = useRef(false)
  const savedKey = ['cook-step', recipeId]

  const deepLinkIndex =
    initialComponentIndex !== null && initialStepIndex !== null
      ? findStepIndex(steps, initialComponentIndex, initialStepIndex)
      : -1
  const hasDeepLink = deepLinkIndex >= 0

  const { data: savedIndex, isSuccess: savedLoaded } = useQuery({
    queryKey: savedKey,
    queryFn: () => readSavedIndex(recipeId),
    enabled: !hasDeepLink,
    staleTime: Infinity,
  })

  const ready = hasDeepLink || savedLoaded
  const lastIndex = Math.max(0, steps.length - 1)
  const baseIndex = hasDeepLink ? deepLinkIndex : Math.min(savedIndex ?? 0, lastIndex)
  const index = override?.jumpKey === jumpKey ? override.index : baseIndex
  const isLastStep = index === lastIndex

  useEffect(() => {
    if (!ready || steps.length === 0 || finishedRef.current) return

    void AsyncStorage.setItem(stepStorageKey(recipeId), JSON.stringify({ index }))
    void setCookSession({ recipeId, stepIndex: index, totalSteps: steps.length, updatedAt: Date.now() })
  }, [ready, recipeId, index, steps.length, setCookSession])

  useEffect(
    () => () => {
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current)
    },
    [],
  )

  const goBy = useCallback(
    (direction: -1 | 1) => {
      if (lockedRef.current) return

      const next = Math.max(0, Math.min(lastIndex, index + direction))
      if (next === index) return

      lockedRef.current = true
      lockTimerRef.current = setTimeout(() => {
        lockedRef.current = false
      }, STEP_LOCK_MS)

      setOverride({ jumpKey, index: next })
    },
    [index, jumpKey, lastIndex],
  )

  const finish = useCallback(async () => {
    finishedRef.current = true
    await Promise.all([
      AsyncStorage.removeItem(stepStorageKey(recipeId)),
      AsyncStorage.removeItem(checkedStorageKey(recipeId)),
    ])
    queryClient.setQueryData(['cook-step', recipeId], null)
    queryClient.setQueryData(['cook-checked', recipeId], [])
    await clearCookSession(recipeId)
  }, [clearCookSession, queryClient, recipeId])

  return { ready, index, isLastStep, goBy, finish }
}

export default useCookSession
