export type LiveChannel = 'recipes' | 'mealPlan' | 'shoppingList' | 'importJobs'

export type LiveEvent = {
  channel: LiveChannel
  type?: string
  event?: string
  [key: string]: unknown
}

type LiveListener = {
  onEvent: (event: LiveEvent, id?: number) => void
  onResubscribe?: () => void
}

type LiveTransportHandlers = {
  onEvent: (event: LiveEvent, id?: number) => void
  onResubscribe: () => void
}

export type LiveTransport = {
  open: (handlers: LiveTransportHandlers, getLastEventId: () => number | undefined) => () => void
}

const IMPORT_SNAPSHOT_EVENT = 'import_jobs.snapshot'
const REPLAYED_SHOPPING_TYPES = new Set(['list_snapshot', 'presence'])

export const createLiveEventHub = (transport: LiveTransport) => {
  const listeners: Record<LiveChannel, Set<LiveListener>> = {
    recipes: new Set(),
    mealPlan: new Set(),
    shoppingList: new Set(),
    importJobs: new Set(),
  }
  const replayedShoppingEvents = new Map<string, LiveEvent>()
  let closeTransport: (() => void) | null = null
  let lastImportEventId: number | undefined
  let importSnapshotSeen = false

  const listenerCount = () => Object.values(listeners).reduce((total, set) => total + set.size, 0)

  const dispatch = (event: LiveEvent, id?: number) => {
    const channelListeners = listeners[event.channel]
    if (!channelListeners) return

    if (event.channel === 'importJobs') {
      if (id !== undefined) lastImportEventId = id
      if (event.event === IMPORT_SNAPSHOT_EVENT) importSnapshotSeen = true
    }
    if (event.channel === 'shoppingList' && event.type && REPLAYED_SHOPPING_TYPES.has(event.type)) {
      replayedShoppingEvents.set(event.type, event)
    }

    channelListeners.forEach((listener) => listener.onEvent(event, id))
  }

  const notifyResubscribe = () => {
    Object.values(listeners).forEach((set) => set.forEach((listener) => listener.onResubscribe?.()))
  }

  const open = () => {
    closeTransport = transport.open({ onEvent: dispatch, onResubscribe: notifyResubscribe }, () => lastImportEventId)
  }

  const shutdown = () => {
    closeTransport?.()
    closeTransport = null
    replayedShoppingEvents.clear()
    lastImportEventId = undefined
    importSnapshotSeen = false
  }

  const restart = () => {
    closeTransport?.()
    importSnapshotSeen = false
    open()
    notifyResubscribe()
  }

  const subscribe = (
    channel: LiveChannel,
    onEvent: (event: LiveEvent, id?: number) => void,
    onResubscribe?: () => void,
  ): (() => void) => {
    const listener: LiveListener = { onEvent, onResubscribe }
    listeners[channel].add(listener)

    if (!closeTransport) open()
    else if (channel === 'importJobs' && importSnapshotSeen) restart()
    else if (channel === 'shoppingList') replayedShoppingEvents.forEach((event) => onEvent(event))

    return () => {
      if (!listeners[channel].delete(listener)) return
      if (listenerCount() === 0) shutdown()
    }
  }

  return { subscribe }
}
