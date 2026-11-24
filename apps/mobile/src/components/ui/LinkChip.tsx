import { memo, useCallback } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { SymbolView } from 'expo-symbols'
import Thumbnail from './Thumbnail'
import { palette, radius, typography, usePressScale } from '../../theme'
import { lightHaptic } from './haptics'

export type LinkChipVariant = 'recipe' | 'web'

interface LinkChipProps {
  variant: LinkChipVariant
  label: string
  imageUrl?: string | null
  onPress: () => void
  disabled?: boolean
  accessibilityLabel?: string
}

const HEIGHT = 30
const LEADING_SIZE = 22
const TRAILING_ICON_SIZE = 11
const LEADING_ICON_SIZE = 12

const LinkChip = ({ variant, label, imageUrl = null, onPress, disabled, accessibilityLabel }: LinkChipProps) => {
  const { animatedStyle, onPressIn, onPressOut } = usePressScale()

  const handlePress = useCallback(() => {
    lightHaptic()
    onPress()
  }, [onPress])

  const isRecipe = variant === 'recipe'

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      hitSlop={7}
      style={styles.pressable}
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
    >
      <Animated.View style={[styles.chip, animatedStyle]}>
        {isRecipe ? (
          <Thumbnail url={imageUrl} size={LEADING_SIZE} radiusKey="badge" glyph="fork.knife" tone="plain" />
        ) : (
          <View style={styles.webTile}>
            <SymbolView name="link" size={LEADING_ICON_SIZE} weight="bold" tintColor={palette.actionText} />
          </View>
        )}
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        <SymbolView
          name={isRecipe ? 'chevron.right' : 'arrow.up.right'}
          size={TRAILING_ICON_SIZE}
          weight="bold"
          tintColor={palette.actionText}
        />
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  pressable: { alignSelf: 'flex-start', maxWidth: '100%' },
  chip: {
    height: HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 4,
    paddingRight: 10,
    borderRadius: radius.input,
    backgroundColor: palette.tint,
  },
  webTile: {
    width: LEADING_SIZE,
    height: LEADING_SIZE,
    borderRadius: radius.badge,
    backgroundColor: palette.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { ...typography.linkChip, color: palette.actionText, flexShrink: 1 },
})

export default memo(LinkChip)
