import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { MenuView } from '@react-native-menu/menu'
import type { MenuAction, NativeActionEvent } from '@react-native-menu/menu'
import type { HouseholdOut } from '@carrot/shared/types'
import { colors } from '../theme/colors'
import Avatar from './Avatar'

const HouseholdHeaderTitle = ({
  title,
  householdMenuActions,
  onHouseholdAction,
  onHouseholdMenuOpen,
  activeHousehold,
  switchContextLabel,
  isLoadingHouseholds,
}: {
  title: string
  householdMenuActions: MenuAction[]
  onHouseholdAction: ({ nativeEvent }: NativeActionEvent) => void
  onHouseholdMenuOpen: () => void
  activeHousehold: HouseholdOut | null
  switchContextLabel: string
  isLoadingHouseholds: boolean
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
        <Avatar name={activeHousehold?.name ?? ''} color={activeHousehold?.color} size={28} />
      </MenuView>
    )}
    <Text style={styles.headerTitleText} numberOfLines={1}>
      {title}
    </Text>
  </View>
)

export default HouseholdHeaderTitle

const styles = StyleSheet.create({
  headerTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%' },
  headerTitleText: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
    color: colors.label,
  },
  headerAvatarLoading: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
})
