import { createContext, useCallback, useContext, useState } from 'react'

type DebugModeContextValue = {
  enabled: boolean
  setEnabled: (enabled: boolean) => void
}

const STORAGE_KEY = 'debug-mode-enabled'

const DebugModeContext = createContext<DebugModeContextValue>({
  enabled: false,
  setEnabled: () => {},
})

export const DebugModeProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const [enabled, setEnabledState] = useState(
    () => localStorage.getItem(STORAGE_KEY) === '1'
  )

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next)
    localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
  }, [])

  return (
    <DebugModeContext.Provider value={{ enabled, setEnabled }}>
      {children}
    </DebugModeContext.Provider>
  )
}

export const useDebugMode = () => useContext(DebugModeContext)
