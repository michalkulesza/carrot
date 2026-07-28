import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Appearance, StyleSheet, View, useColorScheme } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SplashScreen from 'expo-splash-screen'
import PostSplashAnimation from '../components/PostSplashAnimation'

// Keep the native splash up until the persisted appearance preference (if any) is
// applied, so a device in dark mode never shows a light first frame before flipping.
void SplashScreen.preventAutoHideAsync()

export type AppearanceMode = 'light' | 'dark' | 'system'
type ResolvedColorScheme = 'light' | 'dark'

type ColorSchemeContextValue = {
  mode: AppearanceMode
  resolvedColorScheme: ResolvedColorScheme
  setMode: (mode: AppearanceMode) => void
  isAppearanceReady: boolean
  revealApp: () => void
}

const ColorSchemeContext = createContext<ColorSchemeContextValue | null>(null)

const STORAGE_KEY = 'color-scheme-preference'
const STARTUP_BACKGROUND = '#ff8a3d'

const isAppearanceMode = (value: string | null): value is AppearanceMode =>
  value === 'light' || value === 'dark' || value === 'system'

const applyAppearanceMode = (mode: AppearanceMode) => {
  Appearance.setColorScheme(mode === 'system' ? 'unspecified' : mode)
}

export const ColorSchemeProvider = ({ children }: { children: React.ReactNode }) => {
  const systemColorScheme = useColorScheme()
  const [mode, setModeState] = useState<AppearanceMode | null>(null)
  const [isAppearanceReady, setIsAppearanceReady] = useState(false)
  const [showPostSplashAnimation, setShowPostSplashAnimation] = useState(false)
  const preferenceWriteQueue = useRef(Promise.resolve())

  useEffect(() => {
    let active = true
    let firstFrame: number | undefined
    let secondFrame: number | undefined

    void AsyncStorage.getItem(STORAGE_KEY)
      .then((storedMode) => {
        if (!active) return

        const initialMode = isAppearanceMode(storedMode) ? storedMode : 'system'
        applyAppearanceMode(initialMode)
        setModeState(initialMode)

        // Appearance updates native semantic colors asynchronously. Keep the
        // startup cover in place until the updated UI has had two frames to lay out.
        firstFrame = requestAnimationFrame(() => {
          secondFrame = requestAnimationFrame(() => {
            if (active) setIsAppearanceReady(true)
          })
        })
      })
      .catch(() => {
        if (!active) return
        applyAppearanceMode('system')
        setModeState('system')
        firstFrame = requestAnimationFrame(() => {
          secondFrame = requestAnimationFrame(() => {
            if (active) setIsAppearanceReady(true)
          })
        })
      })

    return () => {
      active = false
      if (firstFrame !== undefined) cancelAnimationFrame(firstFrame)
      if (secondFrame !== undefined) cancelAnimationFrame(secondFrame)
    }
  }, [])

  const revealApp = useCallback(() => {
    setShowPostSplashAnimation(true)
  }, [])

  const handlePostSplashReady = useCallback(() => {
    void SplashScreen.hideAsync()
  }, [])

  const handlePostSplashFinish = useCallback(() => {
    setShowPostSplashAnimation(false)
  }, [])

  const setMode = useCallback((newMode: AppearanceMode) => {
    applyAppearanceMode(newMode)
    setModeState(newMode)
    preferenceWriteQueue.current = preferenceWriteQueue.current
      .then(() => AsyncStorage.setItem(STORAGE_KEY, newMode))
      .catch(() => undefined)
  }, [])

  const effectiveMode = mode ?? 'system'
  const resolvedColorScheme: ResolvedColorScheme = effectiveMode === 'system'
    ? (systemColorScheme === 'dark' ? 'dark' : 'light')
    : effectiveMode

  return (
    <ColorSchemeContext.Provider
      value={{ mode: effectiveMode, resolvedColorScheme, setMode, isAppearanceReady, revealApp }}
    >
      {isAppearanceReady ? children : <View style={styles.startupBackground} />}
      {showPostSplashAnimation && (
        <PostSplashAnimation onReady={handlePostSplashReady} onFinish={handlePostSplashFinish} />
      )}
    </ColorSchemeContext.Provider>
  )
}

export const useAppearanceMode = () => {
  const context = useContext(ColorSchemeContext)
  if (!context) throw new Error('useAppearanceMode must be used within ColorSchemeProvider')
  return context
}

export const useAppLaunch = () => {
  const { isAppearanceReady, revealApp } = useAppearanceMode()
  return { isAppearanceReady, revealApp }
}

// Native modules that expose their own explicit light/dark override (e.g. expo-glass-effect's
// GlassView) need a resolved 'light' | 'dark' value rather than 'system', since relying on
// ambient trait-collection propagation for those views can lag a frame behind the rest of the UI.
export const useResolvedColorScheme = (): 'light' | 'dark' => {
  const { resolvedColorScheme } = useAppearanceMode()
  return resolvedColorScheme
}

const styles = StyleSheet.create({
  startupBackground: {
    flex: 1,
    backgroundColor: STARTUP_BACKGROUND,
  },
})
