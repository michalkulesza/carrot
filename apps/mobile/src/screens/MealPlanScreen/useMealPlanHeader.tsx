import { useCallback, useLayoutEffect } from 'react'
import { Pressable, View, type PressableStateCallbackType } from 'react-native'
import { Feather } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useTranslation } from 'react-i18next'
import type { NavigationProp, NavigationState } from '@react-navigation/native'
import HeaderTitle from '../../components/HeaderTitle'
import ScrollEdgeEffectAnchor from '../../components/ScrollEdgeEffectAnchor'
import { colors } from '../../theme/colors'
import { styles } from './styles'

const getExportButtonStyle = ({ pressed }: PressableStateCallbackType) => [
  styles.exportBtn,
  pressed && styles.exportBtnPressed,
]

const MealPlanHeaderRight = ({ exporting, onExportPdf }: { exporting: boolean; onExportPdf: () => void }) => {
  const { t } = useTranslation()

  const handleExportPress = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onExportPdf()
  }, [onExportPdf])

  return (
    <View style={styles.headerRight}>
      <Pressable
        onPress={handleExportPress}
        disabled={exporting}
        hitSlop={8}
        style={getExportButtonStyle}
        accessibilityLabel={t('shoppingList.exportPdf')}
        accessibilityRole="button"
      >
        <Feather name="printer" size={22} color={colors.secondaryLabel} />
      </Pressable>
    </View>
  )
}

const MealPlanHeaderTitle = () => {
  const { t } = useTranslation()

  return (
    <View style={styles.headerTitle}>
      <ScrollEdgeEffectAnchor />
      <HeaderTitle title={t('nav.mealPlan')} />
    </View>
  )
}

const renderMealPlanHeaderTitle = () => <MealPlanHeaderTitle />

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
  const renderHeaderRight = useCallback(
    () => <MealPlanHeaderRight exporting={exporting} onExportPdf={onExportPdf} />,
    [exporting, onExportPdf],
  )

  useLayoutEffect(() => {
    const headerOptions = {
      headerTitle: renderMealPlanHeaderTitle,
      headerRight: renderHeaderRight,
    }

    navigation.setOptions(headerOptions)
  }, [navigation, renderHeaderRight])
}
