import {
  Easing,
  withTiming,
  type EntryExitAnimationFunction,
  type LayoutAnimationFunction,
  type SharedValue,
} from 'react-native-reanimated'
import { isMovePhase, type RowPhase } from './helpers'

export const COLLAPSE_MS = 280
export const EXPAND_MS = 320
export const MOVE_MS = 450
export const CLEAR_MS = 450
export const CLEAR_MUTATION_DELAY_MS = 490
export const COMPLETED_GRACE_MS = 10_000
export const FRESH_WINDOW_MS = 1600
export const STRIKE_MIN_MS = 150
export const STRIKE_MAX_MS = 250
export const STRIKE_MS_PER_PT = 0.75
export const DIM_MS = 250
export const FOCUS_UNDERLINE_MS = 150
export const LONG_PRESS_MS = 250
export const DRAG_SNAP_MS = 200
export const DROP_SPACE_MS = 200
export const DRAG_MOVE_REARM_MS = 400
export const ADD_MOVE_HOLD_MS = 1000

export const DIM_OPACITY = 0.45
export const CLEAR_FADE_RATIO = 0.45
export const NO_MAX_HEIGHT = 10_000
export const LIFT_SCALE = 1.03

export const AISLE_SLIDE_MS = 420
export const AISLE_SLIDE_EASING = Easing.bezier(0.32, 0.72, 0, 1)
export const MOVE_EASING = AISLE_SLIDE_EASING
export const COLLAPSE_EASING = Easing.in(Easing.quad)
export const EXPAND_EASING = Easing.out(Easing.quad)
export const CLEAR_EASING = Easing.inOut(Easing.ease)
export const STRIKE_EASING = Easing.out(Easing.quad)

const MOVING_ROW_STYLE = { zIndex: 0 }
const RESTING_ROW_STYLE = { zIndex: 1 }

export const rowStackStyle = (phase: RowPhase) => (isMovePhase(phase) ? MOVING_ROW_STYLE : RESTING_ROW_STYLE)

// Stays on the rows permanently (toggling the prop needs a commit before the reorder); while any blocker
// is set, frame changes snap so the transition never fights drags, row height animations or adds.
export const createMoveTransition = (blockers: SharedValue<boolean>[]): LayoutAnimationFunction => (values) => {
  'worklet'
  const size = { width: values.targetWidth, height: values.targetHeight }
  const target = { originX: values.targetOriginX, originY: values.targetOriginY, ...size }
  if (blockers.some((blocker) => blocker.value)) return { initialValues: target, animations: target }

  const timing = { duration: MOVE_MS, easing: MOVE_EASING }
  return {
    initialValues: { originX: values.currentOriginX, originY: values.currentOriginY, ...size },
    animations: {
      originX: withTiming(values.targetOriginX, timing),
      originY: withTiming(values.targetOriginY, timing),
      ...size,
    },
  }
}

const ENTER_EASING = Easing.out(Easing.cubic)

export const freshEntering: EntryExitAnimationFunction = () => {
  'worklet'
  return {
    initialValues: { opacity: 0, transform: [{ translateY: -10 }] },
    animations: {
      opacity: withTiming(1, { duration: 320, easing: ENTER_EASING }),
      transform: [{ translateY: withTiming(0, { duration: 320, easing: ENTER_EASING }) }],
    },
  }
}

export const fieldEntering: EntryExitAnimationFunction = () => {
  'worklet'
  return {
    initialValues: { opacity: 0, transform: [{ translateY: -6 }] },
    animations: {
      opacity: withTiming(1, { duration: 280, easing: ENTER_EASING }),
      transform: [{ translateY: withTiming(0, { duration: 280, easing: ENTER_EASING }) }],
    },
  }
}
