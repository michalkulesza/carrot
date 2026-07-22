import { useCallback, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '../api/context'
import type { ImportJob, RecipeOut } from '../types'

const queryKey = ['importJobs'] as const

const applyJob = (jobs: ImportJob[], type: string, job: ImportJob): ImportJob[] => {
  if (type === 'import_job.succeeded' || type === 'import_job.cancelled' || type === 'import_job.dismissed') {
    return jobs.filter((item) => item.id !== job.id)
  }
  const existing = jobs.findIndex((item) => item.id === job.id)
  if (existing === -1) return [...jobs, job]
  return jobs.map((item) => (item.id === job.id ? job : item))
}

export const useImportJobs = (scopeKey: string | null) => {
  const api = useApiClient()
  const qc = useQueryClient()
  const lastEventId = useRef(0)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const attempt = useRef(0)
  const completedRecipeIds = useRef(new Set<string>())
  const query = useQuery<ImportJob[]>({ queryKey, queryFn: async () => [], enabled: false, initialData: [] })

  const seed = useCallback((job: ImportJob) => {
    qc.setQueryData<ImportJob[]>(queryKey, (jobs = []) => applyJob(jobs, 'import_job.created', job))
  }, [qc])

  useEffect(() => {
    lastEventId.current = 0
    attempt.current = 0
    qc.setQueryData<ImportJob[]>(queryKey, [])
    if (!scopeKey) return
    let closed = false
    let unsubscribe: (() => void) | undefined
    const connect = () => {
      unsubscribe = api.subscribeImportJobs(
        (snapshot) => qc.setQueryData(queryKey, snapshot.jobs),
        (event) => {
          lastEventId.current = Math.max(lastEventId.current, event.id)
          if (event.type === 'import_job.succeeded') {
            if (event.job.result_recipe_id) completedRecipeIds.current.add(event.job.result_recipe_id)
            void api.listRecipes()
              .then((recipes) => {
                if (closed) return
                qc.setQueryData<RecipeOut[]>(['recipes'], recipes)
                qc.setQueryData<ImportJob[]>(queryKey, (jobs = []) => applyJob(jobs, event.type, event.job))
                void qc.invalidateQueries({ queryKey: ['recipes', 'stats'] })
              })
              .catch(() => {
                if (closed) return
                qc.setQueryData<ImportJob[]>(queryKey, (jobs = []) => applyJob(jobs, event.type, event.job))
                void qc.invalidateQueries({ queryKey: ['recipes'] })
              })
            return
          }
          qc.setQueryData<ImportJob[]>(queryKey, (jobs = []) => applyJob(jobs, event.type, event.job))
        },
        lastEventId.current || undefined,
        () => {
          const delay = Math.min(30_000, 1_000 * 2 ** attempt.current++)
          reconnectTimer.current = setTimeout(() => {
            if (!closed) connect()
          }, delay)
        },
      )
    }
    connect()
    return () => {
      closed = true
      unsubscribe?.()
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
    }
  }, [api, qc, scopeKey])

  const retry = useMutation({
    mutationFn: api.retryImportJob,
    onMutate: async (jobId) => {
      await qc.cancelQueries({ queryKey })
      const previousJobs = qc.getQueryData<ImportJob[]>(queryKey)
      qc.setQueryData<ImportJob[]>(queryKey, (jobs = []) => jobs.map((job) => (
        job.id === jobId
          ? { ...job, status: 'pending', failure_code: null, next_attempt_at: new Date().toISOString() }
          : job
      )))
      return { previousJobs }
    },
    onError: (_error, _jobId, context) => {
      if (context?.previousJobs) qc.setQueryData(queryKey, context.previousJobs)
    },
    onSuccess: (job) => {
      qc.setQueryData<ImportJob[]>(queryKey, (jobs = []) => applyJob(jobs, 'import_job.created', job))
    },
  })
  const cancel = useMutation({ mutationFn: api.cancelImportJob })
  const dismiss = useMutation({
    mutationFn: api.dismissImportJob,
    onMutate: async (jobId) => {
      await qc.cancelQueries({ queryKey })
      const previousJobs = qc.getQueryData<ImportJob[]>(queryKey)
      qc.setQueryData<ImportJob[]>(queryKey, (jobs = []) => jobs.filter((job) => job.id !== jobId))
      return { previousJobs }
    },
    onError: (_error, _jobId, context) => {
      if (context?.previousJobs) qc.setQueryData(queryKey, context.previousJobs)
    },
  })

  return { jobs: query.data ?? [], seed, retry, cancel, dismiss, completedRecipeIds }
}
