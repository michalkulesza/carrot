import { memo } from 'react'
import { StyleSheet, View } from 'react-native'
import { SymbolView, SFSymbol } from 'expo-symbols'
import AppText from './AppText'
import { palette, radius } from '../../theme'

export type IconCircleTone = 'neutral' | 'error' | 'attention'

interface IconCircleProps {
  count?: number
  icon?: SFSymbol
  size?: number
  tone?: IconCircleTone
}

const CIRCLE_SIZE = 36
const ICON_RATIO = 0.5
const COUNT_MAX_FONT_SCALE = 1.3

const BACKGROUNDS: Record<IconCircleTone, string> = {
  neutral: palette.background,
  error: palette.error,
  attention: palette.actionText,
}

const FOREGROUNDS: Record<IconCircleTone, string> = {
  neutral: palette.ink,
  error: palette.background,
  attention: palette.background,
}

const IconCircle = ({ count, icon, size = CIRCLE_SIZE, tone = 'neutral' }: IconCircleProps) => {
  const circleStyle = [styles.circle, { width: size, height: size, backgroundColor: BACKGROUNDS[tone] }]
  const foreground = FOREGROUNDS[tone]

  return (
    <View style={circleStyle}>
      {icon ? (
        <SymbolView name={icon} size={Math.round(size * ICON_RATIO)} weight="bold" tintColor={foreground} />
      ) : (
        <AppText
          variant="body"
          style={[styles.count, { color: foreground }]}
          tabular
          maxFontSizeMultiplier={COUNT_MAX_FONT_SCALE}
        >
          {count ?? 0}
        </AppText>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  circle: {
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: { fontWeight: '700' },
})

export default memo(IconCircle)
