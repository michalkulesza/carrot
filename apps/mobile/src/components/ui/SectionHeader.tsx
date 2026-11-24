import { StyleSheet, View } from 'react-native'
import AppText from './AppText'
import Button from './Button'
import { sectionGap, screenGutter, space } from '../../theme'

interface SectionHeaderProps {
  title: string
  actionLabel?: string
  onAction?: () => void
}

const SectionHeader = ({ title, actionLabel, onAction }: SectionHeaderProps) => {
  const showAction = Boolean(actionLabel && onAction)

  return (
    <View style={styles.row}>
      <AppText variant="sectionHeading" accessibilityRole="header" style={styles.title}>
        {title}
      </AppText>
      {showAction && actionLabel && onAction ? <Button variant="text" size="sm" label={actionLabel} onPress={onAction} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: sectionGap,
    paddingHorizontal: screenGutter,
    paddingBottom: space.md,
  },
  title: { flexShrink: 1 },
})

export default SectionHeader
