import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export interface NotificationItem {
  id: string
  type: 'timer_done' | 'invitation' | 'recipe_imported' | 'recipe_failed'
  title: string
  body: string
  timestamp: number
  recipe_id?: string
  job_id?: string
  job_kind?: string
  job_input?: Record<string, string>
}

const STORAGE_KEY = 'pk-notif-history'
const MAX_ITEMS = 100

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
      'useNotificationHistory must be inside NotificationHistoryProvider',
    )
  return ctx
}

export const NotificationHistoryProvider = ({
  children,
}: {
  children: ReactNode
}) => {
  const [items, setItems] = useState<NotificationItem[]>([])
  const loadedRef = useRef(false)

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    void AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setItems(JSON.parse(raw) as NotificationItem[])
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [items])

  const push = useCallback(
    (item: Omit<NotificationItem, 'id' | 'timestamp'>) => {
      const full: NotificationItem = {
        ...item,
        id: `${item.type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
      }
      setItems((prev) => [full, ...prev].slice(0, MAX_ITEMS))
    },
    [],
  )

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }, [])

  const clearAll = useCallback(() => {
    setItems([])
  }, [])

  return (
    <NotificationHistoryContext.Provider value={{ items, push, dismiss, clearAll }}>
      {children}
    </NotificationHistoryContext.Provider>
  )
}
