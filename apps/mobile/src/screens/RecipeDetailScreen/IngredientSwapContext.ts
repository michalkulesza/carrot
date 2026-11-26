import { createContext, useContext } from 'react'
import type { SwapRewrite } from './useSwapRewriteAnimation'

export interface IngredientSwapActions {
  onOpenSwap: (key: string) => void
  onUndoSwap: (key: string) => void
}

export interface IngredientSwapState {
  targetKey: string | null
  busy: boolean
  rewrites: ReadonlyMap<string, SwapRewrite>
}

const noop = () => undefined

export const IngredientSwapActionsContext = createContext<IngredientSwapActions>({
  onOpenSwap: noop,
  onUndoSwap: noop,
})

export const useIngredientSwapActions = () => useContext(IngredientSwapActionsContext)
