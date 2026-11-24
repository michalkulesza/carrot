import { memo, useCallback, useMemo, useState } from 'react'
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native'
import Pill, { type PillSize, type PillTone } from './Pill'
import { space } from '../../theme'

export interface PillRowItem {
  key: string
  label: string
}

interface PillRowProps {
  items: PillRowItem[]
  tone?: PillTone
  size?: PillSize
}

const GAP = space.xs

const countFittingPills = (widths: number[], overflowWidth: number, available: number) => {
  const total = widths.reduce((sum, width, index) => sum + width + (index > 0 ? GAP : 0), 0)
  if (total <= available) return widths.length

  const budget = available - overflowWidth - GAP
  let used = 0
  let count = 0

  for (const width of widths) {
    const next = used + (count > 0 ? GAP : 0) + width
    if (next > budget) break
    used = next
    count += 1
  }

  return Math.max(count, 1)
}

const MeasuredPill = ({
  index,
  label,
  tone,
  size,
  onMeasure,
}: {
  index: number
  label: string
  tone: PillTone
  size: PillSize
  onMeasure: (index: number, width: number) => void
}) => {
  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => onMeasure(index, event.nativeEvent.layout.width),
    [index, onMeasure],
  )

  return (
    <View style={styles.measured} onLayout={handleLayout}>
      <Pill label={label} tone={tone} size={size} />
    </View>
  )
}

const PillRow = ({ items, tone = 'tint', size = 'sm' }: PillRowProps) => {
  const [available, setAvailable] = useState(0)
  const [widths, setWidths] = useState<Record<number, number>>({})

  const overflowIndex = items.length
  const overflowProbe = `+${items.length}`
  const measuredCount = Object.keys(widths).length
  const ready = available > 0 && measuredCount === items.length + 1

  const visibleCount = useMemo(() => {
    if (!ready) return 0
    const tagWidths = items.map((_, index) => widths[index])

    return countFittingPills(tagWidths, widths[overflowIndex], available)
  }, [ready, items, widths, overflowIndex, available])

  const hiddenCount = items.length - visibleCount
  const visibleItems = items.slice(0, visibleCount)

  const handleContainerLayout = useCallback(
    (event: LayoutChangeEvent) => setAvailable(event.nativeEvent.layout.width),
    [],
  )

  const handleMeasure = useCallback(
    (index: number, width: number) =>
      setWidths((current) => (current[index] === width ? current : { ...current, [index]: width })),
    [],
  )

  const containerStyle = useMemo(() => [styles.row, !ready && styles.hidden], [ready])

  return (
    <View style={containerStyle} onLayout={handleContainerLayout}>
      {visibleItems.map((item) => (
        <Pill key={item.key} label={item.label} tone={tone} size={size} />
      ))}
      {hiddenCount > 0 ? <Pill label={`+${hiddenCount}`} tone="neutral" size={size} /> : null}
      {ready ? null : (
        <View style={styles.probe} pointerEvents="none">
          {items.map((item, index) => (
            <MeasuredPill
              key={item.key}
              index={index}
              label={item.label}
              tone={tone}
              size={size}
              onMeasure={handleMeasure}
            />
          ))}
          <MeasuredPill index={overflowIndex} label={overflowProbe} tone="neutral" size={size} onMeasure={handleMeasure} />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: GAP },
  hidden: { opacity: 0 },
  probe: { position: 'absolute', left: 0, top: 0, width: 10000, flexDirection: 'row', opacity: 0 },
  measured: { flexShrink: 0 },
})

export default memo(PillRow)
