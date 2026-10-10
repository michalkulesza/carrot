import { useSyncExternalStore } from 'react'

interface DeviceCaptureState {
  capturingJobId: string | null
  needsInteractionJobIds: ReadonlySet<string>
}

let state: DeviceCaptureState = { capturingJobId: null, needsInteractionJobIds: new Set() }
const attemptedJobIds = new Set<string>()
const listeners = new Set<() => void>()

const update = (next: Partial<DeviceCaptureState>) => {
  state = { ...state, ...next }
  listeners.forEach((listener) => listener())
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => state

export const deviceCaptureStore = {
  hasAttempted: (jobId: string) => attemptedJobIds.has(jobId),
  markAttempted: (jobId: string) => {
    attemptedJobIds.add(jobId)
  },
  setCapturing: (jobId: string | null) => update({ capturingJobId: jobId }),
  markNeedsInteraction: (jobId: string) =>
    update({ needsInteractionJobIds: new Set(state.needsInteractionJobIds).add(jobId) }),
  reset: (jobId: string) => {
    attemptedJobIds.delete(jobId)
    if (!state.needsInteractionJobIds.has(jobId)) return
    const next = new Set(state.needsInteractionJobIds)
    next.delete(jobId)
    update({ needsInteractionJobIds: next })
  },
}

export const useDeviceCaptureState = () => useSyncExternalStore(subscribe, getSnapshot)
