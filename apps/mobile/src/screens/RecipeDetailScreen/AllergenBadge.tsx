import { memo, useCallback, useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { TooltipPopover } from '../../components/NutritionBoxGrid'
import { styles } from './styles'

interface AllergenBadgeProps {
  label: string
  accessibilityLabel: string
  tooltipHeader?: string
  tooltipText?: string
  onTooltipOpenChange?: (open: boolean) => void
}

const AllergenBadge = ({ label, accessibilityLabel, tooltipHeader, tooltipText, onTooltipOpenChange }: AllergenBadgeProps) => {
  const [open, setOpen] = useState(false)

  const handleToggle = useCallback(() => {
    const next = !open
    setOpen(next)
    onTooltipOpenChange?.(next)
  }, [open, onTooltipOpenChange])

  const handleDismiss = useCallback(() => {
    setOpen(false)
    onTooltipOpenChange?.(false)
  }, [onTooltipOpenChange])

  const accessibilityState = useMemo(() => ({ expanded: open }), [open])

  const badge = (
    <View style={styles.allergenBadge}>
      <Text style={styles.allergenBadgeText}>{label}</Text>
    </View>
  )

  if (!tooltipText) {
    return (
      <View accessible accessibilityLabel={accessibilityLabel} style={styles.allergenBadgeWrapper}>
        {badge}
      </View>
    )
  }

  return (
    <View style={styles.allergenBadgeWrapper}>
      <Pressable
        onPress={handleToggle}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={accessibilityState}
      >
        {badge}
      </Pressable>
      {open ? <TooltipPopover text={tooltipText} header={tooltipHeader} alignRight={false} onDismiss={handleDismiss} /> : null}
    </View>
  )
}

export default memo(AllergenBadge)
