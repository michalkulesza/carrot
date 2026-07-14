import { View } from 'react-native'
import { MenuView } from '@react-native-menu/menu'
import type { MenuAction, NativeActionEvent } from '@react-native-menu/menu'
import { Feather } from '@expo/vector-icons'
import BellMenu from '../../components/BellMenu'
import BugReportButton from '../../components/BugReportButton'
import { colors } from '../../theme/colors'
import { styles } from './styles'

const HeaderRight = ({
  sortByLabel,
  filterMenuActions,
  onFilterAction,
}: {
  sortByLabel: string
  filterMenuActions: MenuAction[]
  onFilterAction: ({ nativeEvent }: NativeActionEvent) => void
}) => {
  return (
    <View style={styles.headerBtns}>
      <MenuView title={sortByLabel} actions={filterMenuActions} onPressAction={onFilterAction}>
        <View style={styles.headerBtn}>
          <Feather name="sliders" size={22} color={colors.secondaryLabel} />
        </View>
      </MenuView>
      <BugReportButton />
      <BellMenu />
    </View>
  )
}

export default HeaderRight
