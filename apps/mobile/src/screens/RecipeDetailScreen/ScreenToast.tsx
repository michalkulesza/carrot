import { memo, useEffect } from 'react'
import { AccessibilityInfo, Pressable, Text } from 'react-native'
import Animated from 'react-native-reanimated'
import { SymbolView } from 'expo-symbols'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useResolvedColorScheme } from '../../context/ColorSchemeContext'
import { paletteTones, useMotion } from '../../theme'
import { getGroceryBottomOffset, PILL_HIT_SLOP } from './groceryLayout'
import { styles } from './styles'

interface ScreenToastProps {
  message: string
  onUndo: () => void
}

const ICON_SIZE = 20

const ScreenToast = ({ message, onUndo }: ScreenToastProps) => {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const scheme = useResolvedColorScheme()
  const { entering, exiting } = useMotion()

  const surface = scheme === 'dark' ? paletteTones.control[1] : paletteTones.ink[0]
  const containerStyle = [styles.toast, { bottom: getGroceryBottomOffset(insets.bottom), backgroundColor: surface }]

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(message)
  }, [message])

  return (
    <Animated.View
      style={containerStyle}
      entering={entering}
      exiting={exiting}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <SymbolView name="checkmark.circle.fill" size={ICON_SIZE} tintColor={paletteTones.success[1]} />
      <Text style={styles.toastText} numberOfLines={1}>
        {message}
      </Text>
      <Pressable
        style={styles.toastUndo}
        onPress={onUndo}
        hitSlop={PILL_HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={t('common.undo')}
      >
        <Text style={styles.toastUndoText}>{t('common.undo')}</Text>
      </Pressable>
    </Animated.View>
  )
}

export default memo(ScreenToast)
