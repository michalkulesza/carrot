import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'

type DebugModeContextValue = {
  enabled: boolean
  setEnabled: (enabled: boolean) => void
}

type DebugModeProviderProps = {
  children: React.ReactNode
}

const STORAGE_KEY = 'debug-mode-enabled'

const DebugModeContext = createContext<DebugModeContextValue>({
  enabled: false,
  setEnabled: () => {},
})

export const DebugModeProvider = ({ children }: DebugModeProviderProps) => {
  const [enabled, setEnabledState] = useState(
    () => localStorage.getItem(STORAGE_KEY) === '1'
  )

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next)
    localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
  }, [])

  const value = useMemo(() => ({ enabled, setEnabled }), [enabled, setEnabled])

  return (
    <DebugModeContext.Provider value={value}>
      {children}
    </DebugModeContext.Provider>
  )
}

export const useDebugMode = () => useContext(DebugModeContext)
