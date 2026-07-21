import { useLayoutEffect } from 'react'
import { Pressable, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useTranslation } from 'react-i18next'
import type { NavigationProp, NavigationState } from '@react-navigation/native'
import BellMenu from '../../components/BellMenu'
import BugReportButton from '../../components/BugReportButton'
import HeaderTitle from '../../components/HeaderTitle'
import { colors } from '../../theme/colors'
import { styles } from './styles'

const MealPlanHeaderRight = ({ exporting, onExportPdf }: { exporting: boolean; onExportPdf: () => void }) => {
  const { t } = useTranslation()

  return (
    <View style={styles.headerRight}>
      <Pressable
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          onExportPdf()
        }}
        disabled={exporting}
        hitSlop={8}
        style={({ pressed }) => [styles.exportBtn, pressed && { opacity: 0.7 }]}
        accessibilityLabel={t('shoppingList.exportPdf')}
        accessibilityRole="button"
      >
        <Feather name="printer" size={22} color={colors.secondaryLabel} />
      </Pressable>
      <BugReportButton />
      <BellMenu />
    </View>
  )
}

export const useMealPlanHeader = ({
  navigation,
  exporting,
  onExportPdf,
}: {
  navigation: Omit<NavigationProp<ReactNavigation.RootParamList>, 'getState'> & {
    getState(): NavigationState | undefined
  }
  exporting: boolean
  onExportPdf: () => void
}) => {
  const { t } = useTranslation()

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => <HeaderTitle title={t('nav.mealPlan')} />,
      headerRight: () => <MealPlanHeaderRight exporting={exporting} onExportPdf={onExportPdf} />,
    })
  }, [navigation, onExportPdf, exporting, t])
}
