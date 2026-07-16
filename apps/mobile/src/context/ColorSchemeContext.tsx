import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useState } from 'react'
import { Appearance } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SplashScreen from 'expo-splash-screen'

// Keep the native splash up until the persisted appearance preference (if any) is
// applied, so a device in dark mode never shows a light first frame before flipping.
void SplashScreen.preventAutoHideAsync()

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

const applyAppearanceMode = (mode: AppearanceMode) => {
  const colorScheme = mode === 'system' ? null : mode
  Appearance.setColorScheme(colorScheme as never)
}

export const ColorSchemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [mode, setModeState] = useState<AppearanceMode>('system')

  useLayoutEffect(() => {
    applyAppearanceMode('system')
  }, [])

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((val) => {
        if (val === 'light' || val === 'dark' || val === 'system') {
          setModeState(val)
          applyAppearanceMode(val)
        }
      })
      .finally(() => {
        void SplashScreen.hideAsync()
      })
  }, [])

  const setMode = useCallback((newMode: AppearanceMode) => {
    setModeState(newMode)
    void AsyncStorage.setItem(STORAGE_KEY, newMode)
    applyAppearanceMode(newMode)
  }, [])

  return (
    <ColorSchemeContext.Provider value={{ mode, setMode }}>
      {children}
    </ColorSchemeContext.Provider>
  )
}

export const useAppearanceMode = () => useContext(ColorSchemeContext)
