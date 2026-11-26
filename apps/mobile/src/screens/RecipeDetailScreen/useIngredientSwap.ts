import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'
import { useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '@carrot/shared/api/context'
import { getConflictInfo, getErrorStatus } from '@carrot/shared/api/errors'
import type { RecipeOut, SaveComponent } from '@carrot/shared/types'
import {
  applyIngredientReplaceMany,
  applyIngredientRestoreMany,
  type SubstitutionTarget,
} from '@carrot/shared/utils/ingredientSubstitution'
import { upsertRecipe } from '@carrot/shared/utils/recipeCache'
import { lightHaptic } from '../../components/ui/haptics'
import type { IngredientSwapActions, IngredientSwapState } from './IngredientSwapContext'
import { buildRecipeSaveRequest, type IngredientEntry } from './helpers'
import {
  buildSwapPlan,
  isSwappableEntry,
  type SwapItem,
  type SwapPlan,
} from './swapHelpers'
import { reportUnexpectedError, showRecipeChangedAlert, showRecipeLockedAlert } from './useRecipeEditLock'
import { SWAP_REWRITE_TOTAL_MS, SWAP_STAGGER_MS, type SwapRewrite } from './useSwapRewriteAnimation'

const REWRITE_CLEANUP_BUFFER_MS = 200
const NO_REWRITES: ReadonlyMap<string, SwapRewrite> = new Map()
const RECIPES_KEY = ['recipes']

type CommitResult = 'saved' | 'failed' | 'skipped'

const toTargets = (items: SwapItem[]): SubstitutionTarget[] =>
  items.map((item) => ({ ci: item.componentIndex, ii: item.ingredientIndex }))

export const useIngredientSwap = ({
  recipe,
  entries,
  activeAllergens,
  servingScale,
  onRecipeRemoved,
}: {
  recipe: RecipeOut
  entries: IngredientEntry[]
  activeAllergens: string[]
  servingScale: number
  onRecipeRemoved: () => void
}) => {
  const { t } = useTranslation()
  const api = useApiClient()
  const qc = useQueryClient()
  const reduceMotion = useReducedMotion()
  const [plan, setPlan] = useState<SwapPlan | null>(null)
  const [rewrites, setRewrites] = useState<ReadonlyMap<string, SwapRewrite>>(NO_REWRITES)
  const [busy, setBusy] = useState(false)
  const pendingRef = useRef<Promise<CommitResult> | null>(null)
  const recipeId = recipe.id

  const rewriteIdRef = useRef(0)
  const rewriteTimersRef = useRef(new Set<ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const timers = rewriteTimersRef.current

    return () => timers.forEach(clearTimeout)
  }, [])

  const removeRewrites = useCallback((started: ReadonlyMap<string, SwapRewrite>) => {
    setRewrites((current) => {
      const next = new Map(current)
      started.forEach((rewrite, key) => {
        if (next.get(key)?.id === rewrite.id) next.delete(key)
      })

      return next.size === current.size ? current : next
    })
  }, [])

  const startRewrites = useCallback(
    (items: { key: string; delayMs: number; direction: SwapRewrite['direction'] }[]) => {
      const started = new Map<string, SwapRewrite>(
        items.map(({ key, delayMs, direction }) => [key, { id: ++rewriteIdRef.current, delayMs, direction }]),
      )
      setRewrites((current) => new Map([...current, ...started]))

      started.forEach((rewrite, key) => {
        const timer = setTimeout(() => {
          rewriteTimersRef.current.delete(timer)
          removeRewrites(new Map([[key, rewrite]]))
        }, rewrite.delayMs + SWAP_REWRITE_TOTAL_MS + REWRITE_CLEANUP_BUFFER_MS)
        rewriteTimersRef.current.add(timer)
      })

      return started
    },
    [removeRewrites],
  )

  const latestRef = useRef({ recipe, entries, activeAllergens, servingScale, plan, t, reduceMotion, onRecipeRemoved, api })
  latestRef.current = { recipe, entries, activeAllergens, servingScale, plan, t, reduceMotion, onRecipeRemoved, api }

  const handleSaveError = useCallback(
    (error: unknown, failureMessage: string) => {
      const { t, onRecipeRemoved } = latestRef.current
      const conflict = getConflictInfo(error)

      if (conflict?.code === 'recipe_locked') {
        showRecipeLockedAlert(t, conflict)
        return
      }

      if (conflict?.code === 'recipe_changed') {
        showRecipeChangedAlert(t, () => void qc.invalidateQueries({ queryKey: RECIPES_KEY }))
        return
      }

      if (getErrorStatus(error) === 404) {
        onRecipeRemoved()
        return
      }

      reportUnexpectedError(error, 'updateRecipe')
      Alert.alert(t('common.somethingWentWrong'), failureMessage)
    },
    [qc],
  )

  const commit = useCallback(
    (
      apply: (components: SaveComponent[]) => SaveComponent[] | null,
      failureMessage: string,
    ): Promise<CommitResult> => {
      const run = async (): Promise<CommitResult> => {
        const { recipe: currentRecipe, api } = latestRef.current
        const previous = qc.getQueryData<RecipeOut[]>(RECIPES_KEY)?.find((item) => item.id === recipeId) ?? currentRecipe

        try {
          const components = apply(previous.components)
          if (!components) return 'skipped'

          setBusy(true)
          qc.setQueryData<RecipeOut[]>(RECIPES_KEY, (list) => upsertRecipe(list, { ...previous, components }))

          const payload = {
            ...buildRecipeSaveRequest(previous, { components }),
            expected_edit_version: previous.edit_version,
          }
          const updated = await api.updateRecipe(recipeId, payload)
          qc.setQueryData<RecipeOut[]>(RECIPES_KEY, (list) => upsertRecipe(list, updated))
          void qc.invalidateQueries({ queryKey: ['allergen-recheck-status'] })

          return 'saved'
        } catch (error) {
          qc.setQueryData<RecipeOut[]>(RECIPES_KEY, (list) => upsertRecipe(list, previous))
          handleSaveError(error, failureMessage)

          return 'failed'
        } finally {
          setBusy(false)
        }
      }

      const pending: Promise<CommitResult> = run().finally(() => {
        if (pendingRef.current === pending) pendingRef.current = null
      })
      pendingRef.current = pending

      return pending
    },
    [qc, recipeId, handleSaveError],
  )

  const handleOpenSwap = useCallback((key: string) => {
    const { entries, activeAllergens, servingScale } = latestRef.current
    const entry = entries.find((item) => item.key === key)
    if (pendingRef.current || !entry || !isSwappableEntry(entry, activeAllergens)) return

    lightHaptic()
    setPlan(buildSwapPlan(entry, entries, activeAllergens, servingScale))
  }, [])

  const handleDismissSheet = useCallback(() => setPlan(null), [])

  const handleConfirmSwap = useCallback(
    async (everywhere: boolean) => {
      const { plan, reduceMotion, t } = latestRef.current
      if (!plan || pendingRef.current) return

      const items = everywhere ? [plan.target, ...plan.others] : [plan.target]
      const staggered = items.map((item, index) => ({
        key: item.key,
        delayMs: index * SWAP_STAGGER_MS,
        direction: 'swap' as const,
      }))

      setPlan(null)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      const started = reduceMotion ? null : startRewrites(staggered)

      const result = await commit(
        (components) => applyIngredientReplaceMany(components, toTargets(items)),
        t('recipes.failedToApplySubstitute'),
      )
      if (result !== 'saved' && started) removeRewrites(started)
    },
    [startRewrites, removeRewrites, commit],
  )

  const handleUndoRow = useCallback(
    async (key: string) => {
      const { entries, reduceMotion, t } = latestRef.current
      const entry = entries.find((item) => item.key === key)
      if (pendingRef.current || !entry) return

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      const started = reduceMotion ? null : startRewrites([{ key, delayMs: 0, direction: 'restore' }])

      const result = await commit(
        (components) => applyIngredientRestoreMany(components, [{ ci: entry.componentIndex, ii: entry.ingredientIndex }]),
        t('recipes.failedToRestoreIngredient'),
      )
      if (result !== 'saved' && started) removeRewrites(started)
    },
    [startRewrites, removeRewrites, commit],
  )

  const targetKey = plan?.target.key ?? null
  const state = useMemo<IngredientSwapState>(() => ({ targetKey, busy, rewrites }), [targetKey, busy, rewrites])
  const actions = useMemo<IngredientSwapActions>(
    () => ({ onOpenSwap: handleOpenSwap, onUndoSwap: handleUndoRow }),
    [handleOpenSwap, handleUndoRow],
  )

  return {
    plan,
    state,
    actions,
    handleDismissSheet,
    handleConfirmSwap,
  }
}
