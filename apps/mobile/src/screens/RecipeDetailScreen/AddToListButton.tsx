import { memo, useCallback } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { SymbolView } from 'expo-symbols'
import { useTranslation } from 'react-i18next'
import { palette, useMotion } from '../../theme'

interface AddToListButtonProps {
  added: boolean
  onAdd: () => void
}

const SIZE = 32
const ICON_SIZE = 16

const AddToListButton = ({ added, onAdd }: AddToListButtonProps) => {
  const { t } = useTranslation()
  const { fade, exiting } = useMotion()

  const handlePress = useCallback(() => {
    if (!added) onAdd()
  }, [added, onAdd])

  return (
    <Pressable
      onPress={handlePress}
      disabled={added}
      hitSlop={6}
      style={styles.target}
      accessibilityRole="button"
      accessibilityLabel={added ? t('shoppingList.addedToList') : t('shoppingList.addToList')}
      accessibilityState={{ disabled: added }}
    >
      <View style={styles.glyphBox}>
        <Animated.View key={added ? 'added' : 'add'} entering={fade} exiting={exiting} style={styles.glyph}>
          <SymbolView
            name={added ? 'checkmark' : 'plus'}
            size={ICON_SIZE}
            weight="bold"
            tintColor={added ? palette.successCheck : palette.actionText}
          />
        </Animated.View>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  target: { width: SIZE, height: SIZE },
  glyphBox: { flex: 1 },
  glyph: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
})

export default memo(AddToListButton)
