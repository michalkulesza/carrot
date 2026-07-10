import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export interface NotificationItem {
  id: string
  type: 'timer_done' | 'invitation'
  title: string
  body: string
  timestamp: number
  url?: string
}

const STORAGE_KEY = 'pk-notif-history'
const MAX_ITEMS = 100

function load(): NotificationItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)

    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

interface NotificationHistoryContextValue {
  items: NotificationItem[]
  push: (item: Omit<NotificationItem, 'id' | 'timestamp'>) => void
  dismiss: (id: string) => void
  clearAll: () => void
}

const NotificationHistoryContext =
  createContext<NotificationHistoryContextValue | null>(null)

export const useNotificationHistory = () => {
  const ctx = useContext(NotificationHistoryContext)
  if (!ctx)
    throw new Error(
      'useNotificationHistory must be inside NotificationHistoryProvider'
    )

  return ctx
}

interface NotificationHistoryProviderProps {
  children: ReactNode
}

export const NotificationHistoryProvider = ({
  children,
}: NotificationHistoryProviderProps) => {
  const [items, setItems] = useState<NotificationItem[]>(load)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [items])

  const push = useCallback(
    (item: Omit<NotificationItem, 'id' | 'timestamp'>) => {
      const id = `${item.type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const full: NotificationItem = { ...item, id, timestamp: Date.now() }

      setItems((prev) => [full, ...prev].slice(0, MAX_ITEMS))
    },
    []
  )

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }, [])

  const clearAll = useCallback(() => {
    setItems([])
  }, [])

  const value = useMemo(
    () => ({ items, push, dismiss, clearAll }),
    [items, push, dismiss, clearAll]
  )

  return (
    <NotificationHistoryContext.Provider value={value}>
      {children}
    </NotificationHistoryContext.Provider>
  )
}
