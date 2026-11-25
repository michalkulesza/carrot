import { useCallback } from 'react'
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useApiClient } from '../api/context'
import type { MealPlanEntry, MealPlanItemInput } from '../types'
import { toISODate } from '../utils/dateUtils'

const MEAL_PLAN_MUTATION_KEY = ['mealPlan', 'mutation']
const MONTH_KEY_PATTERN = /^\d{4}-\d{2}$/

type MonthSnapshot = [readonly unknown[], MealPlanEntry[] | undefined][]

interface AddEntriesVariables {
  date: string
  items: MealPlanItemInput[]
}

interface MoveEntryVariables {
  id: string
  to: string
}

const OPTIMISTIC_PREFIX = 'optimistic-'

const monthKey = (date: string) => date.slice(0, 7)

export const isOptimisticEntry = (entry: Pick<MealPlanEntry, 'id'>) => entry.id.startsWith(OPTIMISTIC_PREFIX)

const dishKey = (entry: Pick<MealPlanEntry, 'recipe' | 'text'>): string =>
  entry.recipe ? `recipe:${entry.recipe.id}` : `text:${(entry.text ?? '').trim().toLowerCase()}`

const snapshotMonths = (qc: QueryClient): MonthSnapshot =>
  qc
    .getQueriesData<MealPlanEntry[]>({ queryKey: ['mealPlan'] })
    .filter(([key]) => typeof key[1] === 'string' && MONTH_KEY_PATTERN.test(key[1]))

const restoreMonths = (qc: QueryClient, snapshot: MonthSnapshot) => {
  for (const [key, data] of snapshot) qc.setQueryData(key, data)
}

const updateMonth = (
  qc: QueryClient,
  month: string,
  update: (entries: MealPlanEntry[]) => MealPlanEntry[],
) => {
  qc.setQueryData<MealPlanEntry[]>(['mealPlan', month], (current) => (current ? update(current) : current))
}

const sortByDate = (entries: MealPlanEntry[]) =>
  entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => a.entry.date.localeCompare(b.entry.date) || a.index - b.index)
    .map(({ entry }) => entry)

const buildOptimisticEntry = (date: string, item: MealPlanItemInput, index: number): MealPlanEntry | null => {
  if ('text' in item) {
    return { id: `${OPTIMISTIC_PREFIX}${date}-${index}`, date, recipe: null, text: item.text.trim() }
  }
  if (!item.recipe) return null

  return { id: `${OPTIMISTIC_PREFIX}${date}-${index}`, date, recipe: item.recipe, text: null }
}

const buildOptimisticEntries = (
  existing: MealPlanEntry[],
  { date, items }: AddEntriesVariables,
): MealPlanEntry[] => {
  const seen = new Set(existing.filter((entry) => entry.date === date).map(dishKey))
  const added: MealPlanEntry[] = []

  items.forEach((item, index) => {
    const entry = buildOptimisticEntry(date, item, index)
    if (!entry || seen.has(dishKey(entry))) return

    seen.add(dishKey(entry))
    added.push(entry)
  })

  return added
}

export const useMealPlanMutations = () => {
  const api = useApiClient()
  const qc = useQueryClient()

  const settle = useCallback(() => {
    if (qc.isMutating({ mutationKey: MEAL_PLAN_MUTATION_KEY }) > 1) return

    void qc.invalidateQueries({ queryKey: ['mealPlan'] })
  }, [qc])

  const rollback = useCallback(
    (_error: unknown, _variables: unknown, context: { snapshot: MonthSnapshot } | undefined) => {
      if (context) restoreMonths(qc, context.snapshot)
    },
    [qc],
  )

  const prepare = useCallback(async () => {
    await qc.cancelQueries({ queryKey: ['mealPlan'] })

    return { snapshot: snapshotMonths(qc) }
  }, [qc])

  const addEntries = useMutation({
    mutationKey: MEAL_PLAN_MUTATION_KEY,
    mutationFn: ({ date, items }: AddEntriesVariables) => api.addMealPlanEntries(date, items),
    onMutate: async (variables) => {
      const context = await prepare()

      updateMonth(qc, monthKey(variables.date), (entries) =>
        sortByDate([...entries, ...buildOptimisticEntries(entries, variables)]),
      )

      return context
    },
    onSuccess: (entries) => {
      const todayIso = toISODate(new Date())
      const first = entries[0]
      if (!first || first.date < todayIso) return

      qc.setQueryData<MealPlanEntry | null>(['mealPlan', 'next', todayIso], (current) => {
        if (current === null || current === undefined || first.date <= current.date) return first
        return current
      })
    },
    onError: rollback,
    onSettled: settle,
  })

  const removeEntry = useMutation({
    mutationKey: MEAL_PLAN_MUTATION_KEY,
    mutationFn: (id: string) => api.deleteMealPlanEntryById(id),
    onMutate: async (id) => {
      const context = await prepare()

      for (const [key] of context.snapshot) {
        updateMonth(qc, key[1] as string, (entries) => entries.filter((entry) => entry.id !== id))
      }

      return context
    },
    onError: rollback,
    onSettled: settle,
  })

  const moveEntry = useMutation({
    mutationKey: MEAL_PLAN_MUTATION_KEY,
    mutationFn: ({ id, to }: MoveEntryVariables) => api.moveMealPlanEntryById(id, to),
    onMutate: async ({ id, to }) => {
      const context = await prepare()

      const source = context.snapshot
        .flatMap(([, entries]) => entries ?? [])
        .find((entry) => entry.id === id)
      if (!source || source.date === to) return context

      const duplicateOnTarget = context.snapshot
        .flatMap(([, entries]) => entries ?? [])
        .some((entry) => entry.date === to && dishKey(entry) === dishKey(source))

      for (const [key] of context.snapshot) {
        updateMonth(qc, key[1] as string, (entries) => entries.filter((entry) => entry.id !== id))
      }
      if (!duplicateOnTarget) {
        updateMonth(qc, monthKey(to), (entries) => sortByDate([...entries, { ...source, date: to }]))
      }

      return context
    },
    onError: rollback,
    onSettled: settle,
  })

  return { addEntries, removeEntry, moveEntry }
}
