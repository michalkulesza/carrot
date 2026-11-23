import { useCallback } from 'react'
import { View } from 'react-native'
import { MenuView } from '@react-native-menu/menu'
import type { MenuAction, NativeActionEvent } from '@react-native-menu/menu'
import { SymbolView } from 'expo-symbols'
import * as Haptics from 'expo-haptics'
import { colors } from '../../theme/colors'
import { styles } from './styles'

const SORT_SYMBOL = { ios: 'arrow.up.arrow.down', android: 'swap_vert' } as const

const HeaderRight = ({
  sortByLabel,
  filterMenuActions,
  onFilterAction,
}: {
  sortByLabel: string
  filterMenuActions: MenuAction[]
  onFilterAction: ({ nativeEvent }: NativeActionEvent) => void
}) => {
  const triggerLightHaptic = useCallback(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), [])

  const handlePressAction = useCallback(
    (event: NativeActionEvent) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      onFilterAction(event)
    },
    [onFilterAction],
  )

  return (
    <View style={styles.headerBtns}>
      <MenuView
        title={sortByLabel}
        actions={filterMenuActions}
        onOpenMenu={triggerLightHaptic}
        onPressAction={handlePressAction}
      >
        <View style={styles.headerBtn}>
          <SymbolView
            name={SORT_SYMBOL}
            size={22}
            tintColor={colors.secondaryLabel}
            accessibilityLabel={sortByLabel}
          />
        </View>
      </MenuView>
    </View>
  )
}

export default HeaderRight
