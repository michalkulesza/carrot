import { useCallback, type RefObject } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import { Feather } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import GlassViewSafe from '../../components/GlassViewSafe'
import type { AddRecipeDrawerHandle } from '../../components/AddRecipeDrawer'
import { colors } from '../../theme/colors'
import { styles } from './styles'

const FloatingAddButton = ({
  accessibilityLabel,
  sheetRef,
}: {
  accessibilityLabel: string
  sheetRef: RefObject<AddRecipeDrawerHandle | null>
}) => {
  const insets = useSafeAreaInsets()

  const handlePress = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    sheetRef.current?.present()
  }, [sheetRef])

  const getButtonStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [
      styles.floatingAddButton,
      { bottom: insets.bottom + 16 },
      pressed && styles.floatingButtonPressed,
    ],
    [insets.bottom],
  )

  return (
    <Pressable
      style={getButtonStyle}
      onPress={handlePress}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
    >
      <GlassViewSafe
        style={StyleSheet.absoluteFill}
        glassEffectStyle="clear"
        tintColor={colors.orangeGlass}
      />
      <Feather name="plus" size={24} color={colors.brandText} />
    </Pressable>
  )
}

export default FloatingAddButton
