import { memo, useCallback, useMemo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { SymbolView } from 'expo-symbols'
import { palette } from '../../theme'
import { selectionHaptic } from '../../components/ui/haptics'
import { styles } from './styles'

interface BottomBarProps {
  swipeHint: string
  backLabel: string
  nextSmallLabel: string
  nextTitle: string
  canGoBack: boolean
  onBack: () => void
  onNext: () => void
}

const BottomBar = ({ swipeHint, backLabel, nextSmallLabel, nextTitle, canGoBack, onBack, onNext }: BottomBarProps) => {
  const handleBack = useCallback(() => {
    selectionHaptic()
    onBack()
  }, [onBack])

  const handleNext = useCallback(() => {
    selectionHaptic()
    onNext()
  }, [onNext])

  const backStyle = useMemo(() => [styles.backButton, !canGoBack && styles.backButtonDisabled], [canGoBack])
  const backState = useMemo(() => ({ disabled: !canGoBack }), [canGoBack])
  const getNextStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [styles.nextButton, pressed && styles.nextButtonPressed],
    [],
  )

  return (
    <>
      <Text style={styles.swipeHint}>{swipeHint}</Text>
      <View style={styles.bottomRow}>
        <Pressable
          style={backStyle}
          onPress={handleBack}
          disabled={!canGoBack}
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          accessibilityState={backState}
        >
          <SymbolView name="chevron.left" size={20} weight="bold" tintColor={palette.ink} />
        </Pressable>
        <Pressable style={getNextStyle} onPress={handleNext} accessibilityRole="button" accessibilityLabel={nextTitle}>
          <View>
            <Text style={styles.nextSmall}>{nextSmallLabel}</Text>
            <Text style={styles.nextTitle}>{nextTitle}</Text>
          </View>
          <SymbolView name="chevron.right" size={20} weight="bold" tintColor={palette.onAction} />
        </Pressable>
      </View>
    </>
  )
}

export default memo(BottomBar)
