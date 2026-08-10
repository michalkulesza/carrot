import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'
import { useLocation, useNavigate, type Location } from 'react-router-dom'
import {
  addRecipePath,
  recipePath,
  type ImportMode,
  type StepLocation,
} from './routeState'

type RouteState = {
  background?: Location
  marker?: string
  recipeMode?: 'editing'
}
type RouteNavigation = {
  openRecipe: (
    id: string,
    options?: {
      editing?: boolean
      step?: StepLocation
      background?: Location
    }
  ) => void
  openRelatedRecipe: (id: string) => void
  openAddRecipe: (mode?: ImportMode) => void
  openCookMode: () => void
  closeCookMode: () => void
  closeOverlay: (replace?: boolean) => void
}

const RouteNavigationContext = createContext<RouteNavigation | null>(null)
const documentMarker = crypto.randomUUID()

const currentBackground = (location: Location): Location | undefined => {
  const state = location.state as RouteState | null

  return state?.marker === documentMarker ? state.background : undefined
}

export const RouteNavigationProvider = ({
  children,
}: {
  children: ReactNode
}) => {
  const location = useLocation()
  const navigate = useNavigate()
  const busyRef = useRef(false)
  const guard = useCallback((action: () => void) => {
    if (busyRef.current) return
    busyRef.current = true
    action()
    requestAnimationFrame(() => {
      busyRef.current = false
    })
  }, [])
  const openRecipe = useCallback(
    (
      id: string,
      options: {
        editing?: boolean
        step?: StepLocation
        background?: Location
      } = {}
    ) =>
      guard(() => {
        const background =
          options.background ?? currentBackground(location) ?? location
        const state: RouteState = {
          background,
          marker: documentMarker,
          recipeMode: options.editing ? 'editing' : undefined,
        }
        const target = recipePath(id, options.step)
        if (`${location.pathname}${location.search}${location.hash}` === target)
          return
        navigate(target, { state })
      }),
    [guard, location, navigate]
  )
  const openRelatedRecipe = useCallback(
    (id: string) =>
      guard(() => {
        const state: RouteState = {
          background: currentBackground(location) ?? location,
          marker: documentMarker,
        }
        navigate(recipePath(id), { state })
      }),
    [guard, location, navigate]
  )
  const openAddRecipe = useCallback(
    (mode: ImportMode = 'url') =>
      guard(() => {
        const target = addRecipePath(mode)
        if (`${location.pathname}${location.search}` === target) return
        navigate(target, {
          state: {
            background: currentBackground(location) ?? location,
            marker: documentMarker,
          } satisfies RouteState,
        })
      }),
    [guard, location, navigate]
  )
  const openCookMode = useCallback(
    () =>
      guard(() => {
        if (location.hash === '#cook') return
        navigate(`${location.pathname}${location.search}#cook`, {
          state: location.state,
        })
      }),
    [guard, location, navigate]
  )
  const closeCookMode = useCallback(
    () =>
      guard(() => {
        if (location.hash !== '#cook') return
        navigate(`${location.pathname}${location.search}`, {
          replace: true,
          state: location.state,
        })
      }),
    [guard, location, navigate]
  )
  const closeOverlay = useCallback(
    (replace = false) =>
      guard(() => {
        const background = currentBackground(location)
        navigate(background ?? '/', { replace })
      }),
    [guard, location, navigate]
  )
  const value = useMemo(
    () => ({
      openRecipe,
      openRelatedRecipe,
      openAddRecipe,
      openCookMode,
      closeCookMode,
      closeOverlay,
    }),
    [
      openRecipe,
      openRelatedRecipe,
      openAddRecipe,
      openCookMode,
      closeCookMode,
      closeOverlay,
    ]
  )

  return (
    <RouteNavigationContext.Provider value={value}>
      {children}
    </RouteNavigationContext.Provider>
  )
}

export const useRouteNavigation = () => {
  const context = useContext(RouteNavigationContext)
  if (!context)
    throw new Error(
      'useRouteNavigation must be used within RouteNavigationProvider'
    )

  return context
}

export const getRoutedBackground = (location: Location): Location | undefined =>
  currentBackground(location)
