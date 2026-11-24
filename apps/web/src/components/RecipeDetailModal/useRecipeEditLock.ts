import { useEffect, useRef } from 'react'
import { getConflictInfo } from '@carrot/shared/api/errors'
import type { RecipeLockedConflict } from '@carrot/shared/utils/recipeEditLock'
import { setRecipeEditLock } from '../../api/client'

const KEEPALIVE_INTERVAL_MS = 5000

export type { RecipeLockedConflict }

interface UseRecipeEditLockOptions {
  recipeId: string | undefined
  editVersion: number | undefined
  active: boolean
  onLocked: (conflict: RecipeLockedConflict) => void
}

export const useRecipeEditLock = ({
  recipeId,
  editVersion,
  active,
  onLocked,
}: UseRecipeEditLockOptions) => {
  const expectedVersionRef = useRef<number | undefined>(undefined)
  const editVersionRef = useRef(editVersion)
  editVersionRef.current = editVersion
  const onLockedRef = useRef(onLocked)
  onLockedRef.current = onLocked

  useEffect(() => {
    if (!active || !recipeId) return

    expectedVersionRef.current = editVersionRef.current
    let released = false
    let conflicted = false

    const release = () => {
      void setRecipeEditLock(recipeId, 'stop', { keepalive: true }).catch(
        () => undefined
      )
    }

    const send = async (action: 'start' | 'keepalive') => {
      try {
        await setRecipeEditLock(recipeId, action)
        if (released) release()
      } catch (error) {
        if (released || conflicted) return
        const conflict = getConflictInfo(error)
        if (conflict?.code !== 'recipe_locked') return
        conflicted = true
        onLockedRef.current(conflict)
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void send('start')
    }

    void send('start')
    const interval = setInterval(
      () => void send('keepalive'),
      KEEPALIVE_INTERVAL_MS
    )
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', release)

    return () => {
      released = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', release)
      release()
    }
  }, [active, recipeId])

  return { expectedVersionRef }
}
