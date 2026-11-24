import { memo, useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { palette, radius, typography } from '../../theme'

export type PillTone = 'tint' | 'neutral'
export type PillSize = 'sm' | 'md'

interface PillProps {
  label: string
  tone?: PillTone
  size?: PillSize
}

const BACKGROUNDS: Record<PillTone, string> = {
  tint: palette.tint,
  neutral: palette.control,
}

const FOREGROUNDS: Record<PillTone, string> = {
  tint: palette.actionText,
  neutral: palette.textSecondary,
}

const SIZE_BOXES = StyleSheet.create({
  sm: { borderRadius: radius.input, paddingVertical: 3, paddingHorizontal: 9 },
  md: { borderRadius: radius.control, paddingVertical: 4, paddingHorizontal: 12 },
})

const SIZE_TEXTS = { sm: typography.pillSmall, md: typography.pillMedium }

const Pill = ({ label, tone = 'tint', size = 'sm' }: PillProps) => {
  const containerStyle = useMemo(
    () => [styles.container, SIZE_BOXES[size], { backgroundColor: BACKGROUNDS[tone] }],
    [size, tone],
  )
  const textStyle = useMemo(() => [SIZE_TEXTS[size], { color: FOREGROUNDS[tone] }], [size, tone])

  return (
    <View style={containerStyle}>
      <Text style={textStyle} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flexShrink: 1, alignSelf: 'flex-start' },
})

export default memo(Pill)
