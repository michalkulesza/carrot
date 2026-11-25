import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import HouseholdHeaderTitle from '../../components/HouseholdHeaderTitle'
import { useHousehold } from '../../context/HouseholdContext'
import { useHouseholdMenu } from '../../hooks/useHouseholdMenu'

export const useHomeHeader = (isFetching: boolean) => {
  const { t } = useTranslation()
  const { isLoadingHouseholds, activeHousehold } = useHousehold()
  const { householdMenuActions, handleHouseholdAction, handleHouseholdMenuOpen, switchingHousehold } =
    useHouseholdMenu(isFetching)

  const homeTitle = t('nav.home')
  const switchContextLabel = t('households.switchContext')

  const householdTitle = useMemo(
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

  return { homeTitle, householdTitle, switchingHousehold }
}
