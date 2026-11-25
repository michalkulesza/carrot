import { memo } from 'react'
import { View } from 'react-native'
import { SymbolView } from 'expo-symbols'
import type { MealPlanEntry } from '@carrot/shared/types'
import { palette, radius, type RadiusKey } from '../../theme'
import { Thumbnail } from '../../components/ui'
import { DISH_THUMB_SIZE, styles } from './styles'

interface QuickMealThumbProps {
  size: number
  glyphSize: number
  radiusKey: RadiusKey
  tone: 'tinted' | 'plain'
}

export const QuickMealThumb = memo(({ size, glyphSize, radiusKey, tone }: QuickMealThumbProps) => {
  const boxStyle = [
    styles.quickThumb,
    tone === 'tinted' ? styles.quickThumbTinted : styles.quickThumbPlain,
    { width: size, height: size, borderRadius: radius[radiusKey] },
  ]

  return (
    <View style={boxStyle}>
      <SymbolView name="fork.knife" size={glyphSize} weight="semibold" tintColor={palette.actionText} />
    </View>
  )
})

const DishThumb = ({ entry }: { entry: MealPlanEntry }) => {
  if (!entry.recipe) {
    return <QuickMealThumb size={DISH_THUMB_SIZE} glyphSize={24} radiusKey="thumb" tone="tinted" />
  }

  return <Thumbnail url={entry.recipe.thumbnail_url} size={DISH_THUMB_SIZE} radiusKey="thumb" />
}

export default memo(DishThumb)
