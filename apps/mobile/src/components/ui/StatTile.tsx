import { memo } from 'react'
import { StyleSheet, View } from 'react-native'
import AppText from './AppText'
import { palette, radius, space } from '../../theme'

interface StatTileProps {
  value: string
  label: string
}

const StatTile = ({ value, label }: StatTileProps) => (
  <View style={styles.tile} accessible accessibilityLabel={`${label}: ${value}`}>
    <AppText variant="groupTitle" tone="actionText" tabular numberOfLines={1}>
      {value}
    </AppText>
    <AppText variant="badge" tone="textSecondary" numberOfLines={2} style={styles.label}>
      {label}
    </AppText>
  </View>
)

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.md,
    paddingHorizontal: space.xs,
    borderRadius: radius.control,
    backgroundColor: palette.background,
  },
  label: { textAlign: 'center' },
})

export default memo(StatTile)
