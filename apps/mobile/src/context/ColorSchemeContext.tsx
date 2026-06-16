import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Appearance } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type AppearanceMode = 'light' | 'dark' | 'system'

type ColorSchemeContextValue = {
  mode: AppearanceMode
  setMode: (mode: AppearanceMode) => void
}

const ColorSchemeContext = createContext<ColorSchemeContextValue>({
  mode: 'system',
  setMode: () => {},
})

const STORAGE_KEY = 'color-scheme-preference'

export const ColorSchemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [mode, setModeState] = useState<AppearanceMode>('system')

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (val === 'light' || val === 'dark' || val === 'system') {
        setModeState(val)
        Appearance.setColorScheme(val === 'system' ? null : val)
      }
    })
  }, [])

  const setMode = useCallback((newMode: AppearanceMode) => {
    setModeState(newMode)
    void AsyncStorage.setItem(STORAGE_KEY, newMode)
    Appearance.setColorScheme(newMode === 'system' ? null : newMode)
  }, [])

  return (
    <ColorSchemeContext.Provider value={{ mode, setMode }}>
      {children}
    </ColorSchemeContext.Provider>
  )
}

export const useAppearanceMode = () => useContext(ColorSchemeContext)
