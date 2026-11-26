import { useCallback, useMemo, type ReactNode, type Ref } from 'react'
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  type BottomSheetBackdropProps,
  type BottomSheetBackgroundProps,
  type BottomSheetModalProps,
} from '@gorhom/bottom-sheet'
import { StyleSheet, View } from 'react-native'
import Animated, { Extrapolation, interpolate, useAnimatedStyle } from 'react-native-reanimated'
import { palette, sheetInset } from '../../theme'
import { useSheetCornerRadius } from './useSheetCornerRadius'

const HANDLE_WIDTH = 40
const HANDLE_HEIGHT = 5

const sheetStyles = StyleSheet.create({
  background: {
    backgroundColor: palette.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.sheetRing,
    shadowColor: palette.shadowSoft,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 24,
  },
  handle: { width: HANDLE_WIDTH, height: HANDLE_HEIGHT, borderRadius: HANDLE_HEIGHT / 2, backgroundColor: palette.dividerStrong },
  backdrop: { backgroundColor: palette.backdrop },
  inset: { marginHorizontal: sheetInset },
  contentClip: { flexGrow: 1, overflow: 'hidden' },
})

// Fades the shadow with the sheet's position: a closed sheet rests just below the screen edge, where a static shadow would still show.
const SheetBackground = ({ style, animatedIndex, cornerRadius }: BottomSheetBackgroundProps & { cornerRadius: number }) => {
  const shadowStyle = useAnimatedStyle(() => ({
    shadowOpacity: interpolate(animatedIndex.value, [-1, 0], [0, 1], Extrapolation.CLAMP),
  }))
  const backgroundStyle = useMemo(
    () => [style, sheetStyles.background, { borderRadius: cornerRadius }, shadowStyle],
    [style, cornerRadius, shadowStyle],
  )

  return <Animated.View pointerEvents="none" style={backgroundStyle} />
}

const renderSheetBackdrop = (props: BottomSheetBackdropProps) => (
  <BottomSheetBackdrop
    {...props}
    appearsOnIndex={0}
    disappearsOnIndex={-1}
    pressBehavior="close"
    opacity={1}
    style={[props.style, sheetStyles.backdrop]}
  />
)

type AppSheetProps = Omit<BottomSheetModalProps, 'children'> & { children: ReactNode; ref?: Ref<BottomSheetModal> }

export const AppSheet = ({ ref, style, children, ...props }: AppSheetProps) => {
  const mergedStyle = useMemo(() => [sheetStyles.inset, style], [style])
  const cornerRadius = useSheetCornerRadius()
  const contentClipStyle = useMemo(
    () => [sheetStyles.contentClip, { borderBottomLeftRadius: cornerRadius, borderBottomRightRadius: cornerRadius }],
    [cornerRadius],
  )
  const renderBackground = useCallback(
    (backgroundProps: BottomSheetBackgroundProps) => <SheetBackground {...backgroundProps} cornerRadius={cornerRadius} />,
    [cornerRadius],
  )

  return (
    <BottomSheetModal
      {...props}
      ref={ref}
      detached
      bottomInset={sheetInset}
      style={mergedStyle}
      enablePanDownToClose
      backdropComponent={renderSheetBackdrop}
      backgroundComponent={renderBackground}
      handleIndicatorStyle={sheetStyles.handle}
    >
      <View style={contentClipStyle}>{children}</View>
    </BottomSheetModal>
  )
}
