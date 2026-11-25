import { memo, useCallback, useMemo } from 'react'
import { MenuView, type MenuAction, type NativeActionEvent } from '@react-native-menu/menu'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'
import { IconButton } from '../../components/ui'
import { SORT_OPTIONS, type SortMode } from './helpers'

interface SortMenuButtonProps {
  sort: SortMode
  onSortChange: (sort: SortMode) => void
}

const SortMenuButton = ({ sort, onSortChange }: SortMenuButtonProps) => {
  const { t } = useTranslation()

  const sortByLabel = t('recipes.sortBy')

  const actions = useMemo<MenuAction[]>(
    () =>
      SORT_OPTIONS.map((option) => ({
        id: option.key,
        title: t(option.labelKey),
        state: sort === option.key ? 'on' : 'off',
      })),
    [sort, t],
  )

  const handleOpenMenu = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }, [])

  const handlePressAction = useCallback(
    ({ nativeEvent }: NativeActionEvent) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      onSortChange(nativeEvent.event as SortMode)
    },
    [onSortChange],
  )

  return (
    <MenuView title={sortByLabel} actions={actions} onOpenMenu={handleOpenMenu} onPressAction={handlePressAction}>
      <IconButton variant="glass" icon="arrow.up.arrow.down" accessibilityLabel={sortByLabel} />
    </MenuView>
  )
}

export default memo(SortMenuButton)
