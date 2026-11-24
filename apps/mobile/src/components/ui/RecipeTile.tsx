import { memo, useMemo } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import Animated from 'react-native-reanimated'
import AppText from './AppText'
import Thumbnail from './Thumbnail'
import { space, usePressScale } from '../../theme'
import { lightHaptic } from './haptics'

interface RecipeTileProps {
  title: string
  meta?: string
  imageUrl: string | null
  size?: number
  onPress: () => void
  accessibilityLabel?: string
}

const TILE_SIZE = 148

const RecipeTile = ({ title, meta, imageUrl, size = TILE_SIZE, onPress, accessibilityLabel }: RecipeTileProps) => {
  const { animatedStyle, onPressIn, onPressOut } = usePressScale()

  const containerStyle = useMemo(() => [{ width: size }, styles.container, animatedStyle], [size, animatedStyle])

  const handlePress = () => {
    lightHaptic()
    onPress()
  }

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
    >
      <Animated.View style={containerStyle}>
        <Thumbnail url={imageUrl} size={size} radiusKey="card" />
        <AppText variant="tileTitle" numberOfLines={2}>
          {title}
        </AppText>
        {meta ? (
          <AppText variant="tileMeta" tone="textTertiary" numberOfLines={1}>
            {meta}
          </AppText>
        ) : null}
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { gap: space.xs },
})

export default memo(RecipeTile)
