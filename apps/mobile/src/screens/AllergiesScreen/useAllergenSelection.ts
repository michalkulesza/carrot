import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '@carrot/shared/api/context'
import { usePreferences } from '@carrot/shared/hooks/usePreferences'
import type { AllergenRecheckStatus, UserPreferences } from '@carrot/shared/types'
import { useHousehold } from '../../context/HouseholdContext'

const SEPARATOR = '\u0000'
const RECHECK_POLL_MS = 1_000

export const useAllergenSelection = () => {
  const { t } = useTranslation()
  const api = useApiClient()
  const queryClient = useQueryClient()
  const { preferences, update } = usePreferences()
  const { activeHousehold, refetchHouseholds } = useHousehold()

  const currentAllergens = activeHousehold?.allergens ?? preferences?.personal_allergens ?? []
  const currentKey = currentAllergens.join(SEPARATOR)

  const [selected, setSelected] = useState<string[]>(currentAllergens)
  const [recheckStatus, setRecheckStatus] = useState<AllergenRecheckStatus | null>(null)
  const selectedRef = useRef(selected)
  const saveQueueRef = useRef(Promise.resolve())
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollRunRef = useRef(0)
  const completedRef = useRef(0)
  const pendingSavesRef = useRef(0)
  const unmountedRef = useRef(false)
  const [settledTick, setSettledTick] = useState(0)

  useEffect(() => {
    if (pendingSavesRef.current > 0 || selectedRef.current.join(SEPARATOR) === currentKey) return

    selectedRef.current = currentAllergens
    setSelected(currentAllergens)
  }, [currentKey, settledTick])

  useEffect(() => {
    unmountedRef.current = false

    return () => {
      unmountedRef.current = true
      pollRunRef.current += 1
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    }
  }, [])

  const pollRecheck = useCallback(async () => {
    if (unmountedRef.current) return

    const run = ++pollRunRef.current
    completedRef.current = 0

    const poll = async (): Promise<void> => {
      try {
        const status = await api.getAllergenRecheckStatus()
        if (run !== pollRunRef.current) return

        if (status.completed > completedRef.current || status.done) {
          completedRef.current = status.completed
          void queryClient.invalidateQueries({ queryKey: ['recipes'] })
        }
        setRecheckStatus(status)

        if (!status.done && !unmountedRef.current) {
          pollTimerRef.current = setTimeout(() => void poll(), RECHECK_POLL_MS)
        }
      } catch {
        if (run === pollRunRef.current) setRecheckStatus(null)
      }
    }

    if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    await poll()
  }, [api, queryClient])

  const save = useCallback(
    async (data: string[]) => {
      if (activeHousehold) {
        await api.updateHouseholdAllergens(activeHousehold.id, data)
        await refetchHouseholds()
      } else {
        await update.mutateAsync({ personal_allergens: data } as Partial<UserPreferences>)
      }
      await queryClient.invalidateQueries({ queryKey: ['allergen-recheck-status'] })
      await pollRecheck()
    },
    [activeHousehold, api, pollRecheck, queryClient, refetchHouseholds, update],
  )

  const toggle = useCallback(
    (key: string) => {
      const next = selectedRef.current.includes(key)
        ? selectedRef.current.filter((item) => item !== key)
        : [...selectedRef.current, key]

      selectedRef.current = next
      setSelected(next)
      pendingSavesRef.current += 1

      saveQueueRef.current = saveQueueRef.current.then(async () => {
        try {
          await save(next)
        } catch (e) {
          Alert.alert(t('common.somethingWentWrong'), e instanceof Error ? e.message : t('settings.failedToSave'))
        } finally {
          pendingSavesRef.current -= 1
          if (pendingSavesRef.current === 0 && !unmountedRef.current) setSettledTick((tick) => tick + 1)
        }
      })
    },
    [save, t],
  )

  return { selected, toggle, recheckStatus, householdName: activeHousehold?.name ?? null }
}
