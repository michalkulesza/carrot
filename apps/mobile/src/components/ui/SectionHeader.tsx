import { useMemo, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import AppText from './AppText'
import Button from './Button'
import { sectionGap, screenGutter, space } from '../../theme'

type SectionHeaderVariant = 'heading' | 'caption'

interface SectionHeaderProps {
  title: string
  actionLabel?: string
  onAction?: () => void
  actionDisabled?: boolean
  action?: ReactNode
  count?: string
  topGap?: number
  variant?: SectionHeaderVariant
}

const SectionHeader = ({ title, actionLabel, onAction, actionDisabled, action, count, topGap = sectionGap, variant = 'heading' }: SectionHeaderProps) => {
  const showAction = Boolean(actionLabel && onAction)
  const caption = variant === 'caption'
  const rowStyle = useMemo(
    () => [styles.row, caption && styles.captionRow, { paddingTop: topGap }],
    [topGap, caption],
  )

  return (
    <View style={rowStyle}>
      <AppText
        variant={caption ? 'caption' : 'sectionHeading'}
        tone={caption ? 'textSecondary' : 'ink'}
        accessibilityRole="header"
        style={styles.title}
      >
        {title}
      </AppText>
      <View style={styles.trailing}>
        {count ? (
          <AppText variant="meta" tone="textTertiary">
            {count}
          </AppText>
        ) : null}
        {action ?? null}
        {showAction && actionLabel && onAction ? (
          <Button variant="text" size="sm" label={actionLabel} onPress={onAction} disabled={actionDisabled} />
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: screenGutter,
    paddingBottom: space.md,
  },
  captionRow: { paddingHorizontal: screenGutter + space.xs, paddingBottom: space.sm },
  title: { flexShrink: 1 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
})

export default SectionHeader
