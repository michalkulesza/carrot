import { useCallback, useLayoutEffect, useMemo } from 'react'
import type { NativeStackHeaderItemMenu } from '@react-navigation/native-stack'
import { useNavigation } from 'expo-router'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'
import HouseholdHeaderTitle from '../../components/HouseholdHeaderTitle'
import { useHousehold } from '../../context/HouseholdContext'
import { useHouseholdMenu } from '../../hooks/useHouseholdMenu'
import { SORT_OPTIONS, type SortMode } from './helpers'

interface UseBrowseHeaderParams {
  isFetching: boolean
  sort: SortMode
  onSortChange: (sort: SortMode) => void
  onSearchChangeText: (event: { nativeEvent: { text: string } }) => void
  onSearchCancel: () => void
}

export const useBrowseHeader = ({
  isFetching,
  sort,
  onSortChange,
  onSearchChangeText,
  onSearchCancel,
}: UseBrowseHeaderParams) => {
  const navigation = useNavigation()
  const { t } = useTranslation()
  const { isLoadingHouseholds, activeHousehold } = useHousehold()
  const { householdMenuActions, handleHouseholdAction, handleHouseholdMenuOpen, switchingHousehold } =
    useHouseholdMenu(isFetching)

  const browseTitle = t('nav.browse')
  const sortByLabel = t('recipes.sortBy')
  const searchPlaceholder = t('recipes.searchPlaceholder')
  const switchContextLabel = t('households.switchContext')

  const sortMenuItems = useMemo<NativeStackHeaderItemMenu['menu']['items']>(
    () =>
      SORT_OPTIONS.map((option) => ({
        type: 'action' as const,
        label: t(option.labelKey),
        state: sort === option.key ? ('on' as const) : ('off' as const),
        onPress: () => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
          onSortChange(option.key)
        },
      })),
    [onSortChange, sort, t],
  )

  const renderHeaderTitle = useCallback(
    () => (
      <HouseholdHeaderTitle
        prominent
        title={browseTitle}
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
      browseTitle,
      handleHouseholdAction,
      handleHouseholdMenuOpen,
      householdMenuActions,
      isLoadingHouseholds,
      switchContextLabel,
    ],
  )

  useLayoutEffect(() => {
    const sortItem: NativeStackHeaderItemMenu = {
      type: 'menu',
      label: sortByLabel,
      icon: { type: 'sfSymbol', name: 'arrow.up.arrow.down' },
      accessibilityLabel: sortByLabel,
      menu: { title: sortByLabel, items: sortMenuItems },
    }

    const headerOptions = {
      title: browseTitle,
      headerTitle: renderHeaderTitle,
      unstable_headerRightItems: () => [sortItem],
      headerSearchBarOptions: {
        placeholder: searchPlaceholder,
        onChangeText: onSearchChangeText,
        onCancelButtonPress: onSearchCancel,
        hideWhenScrolling: false,
        hideNavigationBar: false,
        autoCapitalize: 'none' as const,
      },
    }

    navigation.setOptions(headerOptions)
  }, [
    browseTitle,
    navigation,
    onSearchCancel,
    onSearchChangeText,
    renderHeaderTitle,
    searchPlaceholder,
    sortByLabel,
    sortMenuItems,
  ])

  return { switchingHousehold }
}
