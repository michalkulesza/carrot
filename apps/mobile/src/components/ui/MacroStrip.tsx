import { memo, useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
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
  estimatedMarker: string
  missingValue: string
}

const MacroCell = memo(
  ({ item, first, estimatedMarker, missingValue }: { item: MacroStripItem; first: boolean } & Omit<MacroStripProps, 'items'>) => {
    const cellStyle = useMemo(() => [styles.cell, !first && styles.divider], [first])
    const display = item.value ?? missingValue
    const marker = item.estimated && item.value ? `${estimatedMarker} ` : ''

    return (
      <View style={cellStyle}>
        <AppText variant="cardTitle" tabular numberOfLines={1} adjustsFontSizeToFit>
          {`${marker}${display}`}
        </AppText>
        <AppText variant="tileMeta" tone="textSecondary" numberOfLines={1}>
          {item.label}
        </AppText>
      </View>
    )
  },
)

const MacroStrip = ({ items, estimatedMarker, missingValue }: MacroStripProps) => (
  <View style={styles.container}>
    {items.map((item, index) => (
      <MacroCell
        key={item.key}
        item={item}
        first={index === 0}
        estimatedMarker={estimatedMarker}
        missingValue={missingValue}
      />
    ))}
  </View>
)

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingVertical: space.md,
    paddingHorizontal: space.xs,
    borderRadius: radius.card,
    backgroundColor: palette.card,
  },
  cell: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 2 },
  divider: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: palette.dividerStrong },
})

export default memo(MacroStrip)
