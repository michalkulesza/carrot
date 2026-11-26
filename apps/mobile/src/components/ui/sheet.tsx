import { useMemo } from 'react'
import { BottomSheetBackdrop, type BottomSheetBackdropProps, type BottomSheetBackgroundProps } from '@gorhom/bottom-sheet'
import { StyleSheet } from 'react-native'
import Animated, { Extrapolation, interpolate, useAnimatedStyle } from 'react-native-reanimated'
import { palette, radius } from '../../theme'

const HANDLE_WIDTH = 40
const HANDLE_HEIGHT = 5

export const sheetStyles = StyleSheet.create({
  background: {
    backgroundColor: palette.background,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    shadowColor: palette.shadowSoft,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 1,
    shadowRadius: 30,
  },
  handle: { width: HANDLE_WIDTH, height: HANDLE_HEIGHT, borderRadius: HANDLE_HEIGHT / 2, backgroundColor: palette.dividerStrong },
  backdrop: { backgroundColor: palette.backdrop },
})

// Fades the upward shadow with the sheet's position: a closed sheet rests just below the screen edge, where a static shadow would still show.
export const SheetBackground = ({ style, animatedIndex }: BottomSheetBackgroundProps) => {
  const shadowStyle = useAnimatedStyle(() => ({
    shadowOpacity: interpolate(animatedIndex.value, [-1, 0], [0, 1], Extrapolation.CLAMP),
  }))
  const backgroundStyle = useMemo(() => [style, sheetStyles.background, shadowStyle], [style, shadowStyle])

  return <Animated.View pointerEvents="none" style={backgroundStyle} />
}

export const renderSheetBackdrop = (props: BottomSheetBackdropProps) => (
  <BottomSheetBackdrop
    {...props}
    appearsOnIndex={0}
    disappearsOnIndex={-1}
    pressBehavior="close"
    opacity={1}
    style={[props.style, sheetStyles.backdrop]}
  />
)
