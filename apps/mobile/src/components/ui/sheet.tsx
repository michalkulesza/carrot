import { BottomSheetBackdrop, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet'
import { StyleSheet } from 'react-native'
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
