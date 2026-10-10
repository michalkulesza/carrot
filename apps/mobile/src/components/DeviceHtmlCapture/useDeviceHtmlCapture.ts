import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState, Platform } from 'react-native'
import type { WebViewMessageEvent } from 'react-native-webview'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '@carrot/shared/api/context'
import type { CapturedHtmlPayload, ImportJob } from '@carrot/shared/types'
import { CAPTURE_REJECTED_DETAIL } from '@carrot/shared/utils/challengeDetection'
import { useAuth } from '../../context/AuthContext'
import { CAPTURE_TIMEOUT_MS, parseCapturedMessage } from './helpers'
import { deviceCaptureStore } from './store'

const IMPORT_JOBS_KEY = ['importJobs'] as const

const useIsAppActive = () => {
  const [active, setActive] = useState(AppState.currentState === 'active')

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setActive(state === 'active'))
    return () => subscription.remove()
  }, [])

  return active
}

export const useDeviceHtmlCapture = () => {
  const api = useApiClient()
  const qc = useQueryClient()
  const { user } = useAuth()
  const appActive = useIsAppActive()
  const [activeJob, setActiveJob] = useState<ImportJob | null>(null)
  const submittedRef = useRef(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { data: jobs = [] } = useQuery<ImportJob[]>({
    queryKey: IMPORT_JOBS_KEY,
    queryFn: async () => [],
    enabled: false,
    initialData: [],
  })

  const submit = useMutation({
    mutationFn: ({ jobId, payload }: { jobId: string; payload: CapturedHtmlPayload }) =>
      api.submitCapturedHtml(jobId, payload),
    onSuccess: (job) => {
      qc.setQueryData<ImportJob[]>(IMPORT_JOBS_KEY, (current = []) =>
        current.map((item) => (item.id === job.id ? job : item)),
      )
    },
  })

  const candidate = useMemo(() => {
    if (Platform.OS !== 'ios' || !appActive || activeJob || !user) return null
    return (
      jobs.find(
        (job) =>
          job.device_capture_eligible &&
          job.created_by_user_id === user.id &&
          Boolean(job.source_url) &&
          !deviceCaptureStore.hasAttempted(job.id),
      ) ?? null
    )
  }, [jobs, user, appActive, activeJob])

  const clearTimeoutRef = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = null
  }, [])

  const finish = useCallback(
    (jobId: string, needsInteraction: boolean) => {
      clearTimeoutRef()
      if (needsInteraction) deviceCaptureStore.markNeedsInteraction(jobId)
      deviceCaptureStore.setCapturing(null)
      setActiveJob(null)
    },
    [clearTimeoutRef],
  )

  useEffect(() => {
    if (!candidate) return
    submittedRef.current = false
    deviceCaptureStore.markAttempted(candidate.id)
    deviceCaptureStore.setCapturing(candidate.id)
    setActiveJob(candidate)
  }, [candidate])

  useEffect(() => {
    if (!activeJob) return
    const jobId = activeJob.id
    timeoutRef.current = setTimeout(() => finish(jobId, true), CAPTURE_TIMEOUT_MS)
    return clearTimeoutRef
  }, [activeJob, finish, clearTimeoutRef])

  useEffect(() => {
    if (appActive || !activeJob || submittedRef.current) return
    deviceCaptureStore.reset(activeJob.id)
    finish(activeJob.id, false)
  }, [appActive, activeJob, finish])

  const handleMessage = useCallback(
    async (event: WebViewMessageEvent) => {
      if (!activeJob || submittedRef.current) return
      const payload = parseCapturedMessage(event.nativeEvent.data)
      if (!payload) return

      submittedRef.current = true
      clearTimeoutRef()
      try {
        await submit.mutateAsync({ jobId: activeJob.id, payload })
        finish(activeJob.id, false)
      } catch (error) {
        const alreadyHandled = error instanceof Error && error.message === CAPTURE_REJECTED_DETAIL
        finish(activeJob.id, !alreadyHandled)
      }
    },
    [activeJob, submit, finish, clearTimeoutRef],
  )

  const handleError = useCallback(() => {
    if (activeJob && !submittedRef.current) finish(activeJob.id, true)
  }, [activeJob, finish])

  return { activeJob, handleMessage, handleError }
}
