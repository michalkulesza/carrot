import { memo, useCallback, useMemo } from 'react'
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native'
import { SymbolView } from 'expo-symbols'
import AppText from './AppText'
import { palette, radius, space } from '../../theme'

export interface MacroStripItem {
  key: string
  label: string
  value: string | null
  estimated?: boolean
}

interface MacroStripProps {
  items: MacroStripItem[]
  missingValue: string
  estimateAccessibilityLabel?: string
  onEstimatePress?: (index: number) => void
  onLayout?: (event: LayoutChangeEvent) => void
}

export const MACRO_STRIP_PADDING_X = space.xs

const MARKER_SIZE = 10

interface MacroCellProps {
  item: MacroStripItem
  index: number
  missingValue: string
  estimateAccessibilityLabel?: string
  onEstimatePress?: (index: number) => void
}

const MacroCell = memo(({ item, index, missingValue, estimateAccessibilityLabel, onEstimatePress }: MacroCellProps) => {
  const cellStyle = useMemo(() => [styles.cell, index > 0 && styles.divider], [index])
  const display = item.value ?? missingValue
  const isEstimate = Boolean(item.estimated && item.value)

  const handlePress = useCallback(() => onEstimatePress?.(index), [index, onEstimatePress])

  const content = (
    <>
      <View style={styles.valueWrap}>
        <AppText variant="cardTitle" tabular numberOfLines={1}>
          {display}
        </AppText>
        {isEstimate ? (
          <View style={styles.marker}>
            <SymbolView name="sparkle" size={MARKER_SIZE} tintColor={palette.action} />
          </View>
        ) : null}
      </View>
      <AppText variant="tileMeta" tone="textSecondary" numberOfLines={1}>
        {item.label}
      </AppText>
    </>
  )

  if (!isEstimate || !onEstimatePress) {
    return (
      <View style={cellStyle} accessible accessibilityLabel={`${item.label}: ${display}`}>
        {content}
      </View>
    )
  }

  const accessibilityLabel = [`${display} ${item.label}`, estimateAccessibilityLabel].filter(Boolean).join('. ')

  return (
    <Pressable style={cellStyle} onPress={handlePress} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
      {content}
    </Pressable>
  )
})

const MacroStrip = ({ items, missingValue, estimateAccessibilityLabel, onEstimatePress, onLayout }: MacroStripProps) => (
  <View style={styles.container} onLayout={onLayout}>
    {items.map((item, index) => (
      <MacroCell
        key={item.key}
        item={item}
        index={index}
        missingValue={missingValue}
        estimateAccessibilityLabel={estimateAccessibilityLabel}
        onEstimatePress={onEstimatePress}
      />
    ))}
  </View>
)

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingVertical: space.md,
    paddingHorizontal: MACRO_STRIP_PADDING_X,
    borderRadius: radius.card,
    backgroundColor: palette.card,
  },
  cell: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 2 },
  divider: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: palette.dividerStrong },
  valueWrap: { position: 'relative' },
  marker: { position: 'absolute', left: '100%', top: 1, marginLeft: 2 },
})

export default memo(MacroStrip)
