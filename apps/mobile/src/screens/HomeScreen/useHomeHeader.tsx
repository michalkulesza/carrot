import { useCallback, useLayoutEffect } from 'react'
import type { NativeStackHeaderItemButton } from '@react-navigation/native-stack'
import { useNavigation } from 'expo-router'
import { useTranslation } from 'react-i18next'
import HouseholdHeaderTitle from '../../components/HouseholdHeaderTitle'
import { useHousehold } from '../../context/HouseholdContext'
import { useHouseholdMenu } from '../../hooks/useHouseholdMenu'
import { palette } from '../../theme'

interface UseHomeHeaderParams {
  isFetching: boolean
  onAddPress: () => void
}

export const useHomeHeader = ({ isFetching, onAddPress }: UseHomeHeaderParams) => {
  const navigation = useNavigation()
  const { t } = useTranslation()
  const { isLoadingHouseholds, activeHousehold } = useHousehold()
  const { householdMenuActions, handleHouseholdAction, handleHouseholdMenuOpen, switchingHousehold } =
    useHouseholdMenu(isFetching)

  const homeTitle = t('nav.home')
  const addLabel = t('addMenu.label')
  const switchContextLabel = t('households.switchContext')

  const renderHeaderTitle = useCallback(
    () => (
      <HouseholdHeaderTitle
        prominent
        title={homeTitle}
        householdMenuActions={householdMenuActions}
        onHouseholdAction={handleHouseholdAction}
        onHouseholdMenuOpen={handleHouseholdMenuOpen}
        activeHousehold={activeHousehold}
        switchContextLabel={switchContextLabel}
        isLoadingHouseholds={isLoadingHouseholds}
      />
    ),
    [
      activeHousehold,
      handleHouseholdAction,
      handleHouseholdMenuOpen,
      homeTitle,
      householdMenuActions,
      isLoadingHouseholds,
      switchContextLabel,
    ],
  )

  useLayoutEffect(() => {
    const addItem: NativeStackHeaderItemButton = {
      type: 'button',
      label: addLabel,
      icon: { type: 'sfSymbol', name: 'plus' },
      variant: 'prominent',
      tintColor: palette.action,
      accessibilityLabel: addLabel,
      onPress: onAddPress,
    }

    const headerOptions = {
      title: homeTitle,
      headerTitle: renderHeaderTitle,
      unstable_headerRightItems: () => [addItem],
    }

    navigation.setOptions(headerOptions)
  }, [addLabel, homeTitle, navigation, onAddPress, renderHeaderTitle])

  return { switchingHousehold }
}
