import { View } from 'react-native'
import { MenuView } from '@react-native-menu/menu'
import type { MenuAction, NativeActionEvent } from '@react-native-menu/menu'
import { Feather } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
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
  const triggerLightHaptic = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }

  return (
    <View style={styles.headerBtns}>
      <MenuView
        title={sortByLabel}
        actions={filterMenuActions}
        onOpenMenu={triggerLightHaptic}
        onPressAction={(event) => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
          onFilterAction(event)
        }}
      >
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
