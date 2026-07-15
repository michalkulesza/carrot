import { ActivityIndicator, Text, View } from 'react-native'
import { MenuView } from '@react-native-menu/menu'
import type { MenuAction, NativeActionEvent } from '@react-native-menu/menu'
import type { HouseholdOut } from '@carrot/shared/types'
import Avatar from '../../components/Avatar'
import { styles } from './styles'

const HeaderTitle = ({
  title,
  householdMenuActions,
  onHouseholdAction,
  activeHousehold,
  personalName,
  switchContextLabel,
  isLoadingHouseholds,
}: {
  title: string
  householdMenuActions: MenuAction[]
  onHouseholdAction: ({ nativeEvent }: NativeActionEvent) => void
  activeHousehold: HouseholdOut | null
  personalName: string
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
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Avatar name={activeHousehold ? activeHousehold.name : personalName} color={activeHousehold?.color} size={28} />
      </MenuView>
    )}
    <Text style={styles.headerTitleText} numberOfLines={1}>
      {title}
    </Text>
  </View>
)

export default HeaderTitle
