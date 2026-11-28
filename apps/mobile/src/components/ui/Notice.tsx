import { memo, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { SymbolView, type SFSymbol } from 'expo-symbols'
import { palette, radius, space } from '../../theme'

interface NoticeProps {
  children: ReactNode
  icon?: SFSymbol
}

const ICON_SIZE = 16

const Notice = ({ children, icon = 'info.circle' }: NoticeProps) => (
  <View style={styles.notice}>
    <View style={styles.icon}>
      <SymbolView name={icon} size={ICON_SIZE} weight="semibold" tintColor={palette.allergenText} />
    </View>
    <View style={styles.body}>{children}</View>
  </View>
)

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.control,
    backgroundColor: palette.allergen,
  },
  icon: { paddingTop: 2 },
  body: { flex: 1 },
})

export default memo(Notice)
