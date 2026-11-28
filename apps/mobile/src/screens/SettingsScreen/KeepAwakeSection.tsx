import { useCallback, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTranslation } from 'react-i18next'
import { usePreferences } from '@carrot/shared/hooks/usePreferences'
import { SectionHeader, SettingsGroup, SettingsRow } from '../../components/ui'
import { useCookingMode } from '../../context/CookingModeContext'
import { KEEP_AWAKE_SHOPPING_STORAGE_KEY } from './helpers'

const KeepAwakeSection = () => {
  const { t } = useTranslation()
  const { preferences, update } = usePreferences()
  const { enabled: keepAwakeInRecipes, setEnabled: setKeepAwakeInRecipes } = useCookingMode()
  const [keepAwakeShopping, setKeepAwakeShopping] = useState<boolean | null>(null)

  useEffect(() => {
    let active = true

    AsyncStorage.getItem(KEEP_AWAKE_SHOPPING_STORAGE_KEY)
      .then((value) => {
        if (active) setKeepAwakeShopping(value === '1')
      })
      .catch(() => {
        if (active) setKeepAwakeShopping(false)
      })

    return () => {
      active = false
    }
  }, [])

  const handleShoppingToggle = useCallback((value: boolean) => {
    setKeepAwakeShopping(value)
    void AsyncStorage.setItem(KEEP_AWAKE_SHOPPING_STORAGE_KEY, value ? '1' : '0')
  }, [])

  const handleShowCompletedToggle = useCallback(
    (value: boolean) => update.mutate({ show_completed_shopping_items: value }),
    [update],
  )

  return (
    <>
      <SectionHeader variant="caption" title={t('settings.keepScreenOn')} />
      <SettingsGroup>
        <SettingsRow
          icon="book"
          title={t('settings.keepScreenOnRecipes')}
          accessory="switch"
          switchValue={keepAwakeInRecipes}
          onSwitchChange={setKeepAwakeInRecipes}
        />
        <SettingsRow
          icon="cart"
          title={t('settings.keepScreenOnShopping')}
          accessory="switch"
          switchValue={keepAwakeShopping ?? false}
          loading={keepAwakeShopping === null}
          onSwitchChange={handleShoppingToggle}
        />
      </SettingsGroup>

      <SectionHeader variant="caption" title={t('settings.shoppingList')} />
      <SettingsGroup>
        <SettingsRow
          icon="checkmark.circle"
          title={t('settings.showCompletedShoppingItems')}
          subtitle={t('settings.showCompletedShoppingItemsDesc')}
          accessory="switch"
          switchValue={preferences?.show_completed_shopping_items ?? false}
          onSwitchChange={handleShowCompletedToggle}
        />
      </SettingsGroup>
    </>
  )
}

export default KeepAwakeSection
