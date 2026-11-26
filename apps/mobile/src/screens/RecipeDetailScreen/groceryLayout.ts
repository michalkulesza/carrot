const GROCERY_BOTTOM_GAP = 30
const GROCERY_BAR_HEIGHT = 28 + 54

export const PILL_HIT_SLOP = { top: 4, bottom: 4, left: 4, right: 4 }

export const getGroceryBottomOffset = (insetBottom: number) => Math.max(insetBottom, GROCERY_BOTTOM_GAP)

export const getGroceryBarClearance = (insetBottom: number) => getGroceryBottomOffset(insetBottom) + GROCERY_BAR_HEIGHT
