import type { TextLayoutLine } from 'react-native'
import { STRIKE_MAX_MS, STRIKE_MIN_MS, STRIKE_MS_PER_PT } from './motion'

export interface StrikeSegment {
  x: number
  y: number
  width: number
  start: number
  end: number
}

export interface StrikeLayout {
  segments: StrikeSegment[]
  totalWidth: number
}

export const buildStrikeLayout = (lines: TextLayoutLine[]): StrikeLayout => {
  const totalWidth = lines.reduce((sum, line) => sum + line.width, 0)
  let elapsed = 0
  const segments = lines.map((line) => {
    const start = totalWidth > 0 ? elapsed / totalWidth : 0
    elapsed += line.width
    const end = totalWidth > 0 ? elapsed / totalWidth : 1
    return { x: line.x, y: line.y + line.height / 2, width: line.width, start, end }
  })
  return { segments, totalWidth }
}

export const isSameStrikeLayout = (first: StrikeLayout | null, second: StrikeLayout | null) =>
  first === second ||
  (first !== null &&
    second !== null &&
    first.segments.length === second.segments.length &&
    first.segments.every(
      (segment, index) =>
        segment.x === second.segments[index].x &&
        segment.y === second.segments[index].y &&
        segment.width === second.segments[index].width,
    ))

export const strikeDuration = (totalWidth: number) =>
  Math.min(STRIKE_MAX_MS, Math.max(STRIKE_MIN_MS, totalWidth * STRIKE_MS_PER_PT))
