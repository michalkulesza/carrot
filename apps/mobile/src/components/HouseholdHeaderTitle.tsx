import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { MenuView } from '@react-native-menu/menu'
import type { MenuAction, NativeActionEvent } from '@react-native-menu/menu'
import type { HouseholdOut } from '@carrot/shared/types'
import { SymbolView } from 'expo-symbols'
import { colors } from '../theme/colors'
import { palette, typography } from '../theme'
import Avatar from './Avatar'

const HouseholdHeaderTitle = ({
  title,
  householdMenuActions,
  onHouseholdAction,
  onHouseholdMenuOpen,
  activeHousehold,
  switchContextLabel,
  isLoadingHouseholds,
  prominent = false,
}: {
  title: string
  householdMenuActions: MenuAction[]
  onHouseholdAction: ({ nativeEvent }: NativeActionEvent) => void
  onHouseholdMenuOpen: () => void
  activeHousehold: HouseholdOut | null
  switchContextLabel: string
  isLoadingHouseholds: boolean
  prominent?: boolean
}) => (
  // width: '100%' on headerTitleWrap stops iOS from centering this custom
  // headerTitle view when the nav bar has extra room (e.g. iPhone Pro Max).
  <View style={styles.headerTitleWrap}>
    {isLoadingHouseholds ? (
      <View style={styles.headerAvatarLoading}>
        <ActivityIndicator size="small" />
      </View>
    ) : (
      <MenuView
        title={switchContextLabel}
        actions={householdMenuActions}
        onPressAction={onHouseholdAction}
        onOpenMenu={onHouseholdMenuOpen}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <View style={styles.avatarRow}>
          <Avatar name={activeHousehold?.name ?? ''} color={activeHousehold?.color} size={prominent ? 40 : 28} />
          {prominent ? (
            <SymbolView name="chevron.down" size={CARET_SIZE} weight="semibold" tintColor={palette.textTertiary} />
          ) : null}
        </View>
      </MenuView>
    )}
    <Text style={prominent ? styles.prominentTitleText : styles.headerTitleText} numberOfLines={1}>
      {title}
    </Text>
  </View>
)

export default HouseholdHeaderTitle

const CARET_SIZE = 12

const styles = StyleSheet.create({
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  prominentTitleText: { ...typography.screenTitle, color: palette.ink },
  headerTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%' },
  headerTitleText: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
    color: colors.label,
  },
  headerAvatarLoading: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
})
