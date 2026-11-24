import { memo, useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { SymbolView, SFSymbol } from 'expo-symbols'
import ThumbnailImage from '../ThumbnailImage'
import { palette, radius, RadiusKey } from '../../theme'

export type ThumbnailPreset = 'xs' | 'sm' | 'row' | 'tile'
export type ThumbnailTone = 'tint' | 'error' | 'success' | 'plain'

interface ThumbnailProps {
  url: string | null
  size?: ThumbnailPreset | number
  radiusKey?: RadiusKey
  glyph?: SFSymbol
  tone?: ThumbnailTone
}

const PRESET_SIZES: Record<ThumbnailPreset, number> = { xs: 52, sm: 60, row: 88, tile: 148 }

const TONE_COLORS: Record<ThumbnailTone, { background: string; foreground: string }> = {
  tint: { background: palette.tint, foreground: palette.actionText },
  error: { background: palette.errorBg, foreground: palette.error },
  success: { background: palette.successBg, foreground: palette.success },
  plain: { background: palette.background, foreground: palette.action },
}

const GLYPH_RATIO = 0.4

const Thumbnail = ({ url, size = 'sm', radiusKey = 'input', glyph, tone = 'tint' }: ThumbnailProps) => {
  const dimension = typeof size === 'number' ? size : PRESET_SIZES[size]
  const imageSize = dimension > PRESET_SIZES.sm ? 'full' : 'small'

  const boxStyle = useMemo(
    () => ({ width: dimension, height: dimension, borderRadius: radius[radiusKey] }),
    [dimension, radiusKey],
  )

  if (!url && glyph) {
    const { background, foreground } = TONE_COLORS[tone]

    return (
      <View style={[boxStyle, styles.glyphTile, { backgroundColor: background }]}>
        <SymbolView name={glyph} size={Math.round(dimension * GLYPH_RATIO)} weight="semibold" tintColor={foreground} />
      </View>
    )
  }

  return (
    <View style={[boxStyle, styles.clip]}>
      <ThumbnailImage url={url} size={imageSize} style={boxStyle} />
    </View>
  )
}

const styles = StyleSheet.create({
  glyphTile: { alignItems: 'center', justifyContent: 'center' },
  clip: { overflow: 'hidden', backgroundColor: palette.control },
})

export default memo(Thumbnail)
