import { useCallback } from 'react'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { usePreferences } from '@carrot/shared/hooks/usePreferences'
import { SectionHeader, SettingsGroup, SettingsRow } from '../../components/ui'
import { useHousehold } from '../../context/HouseholdContext'
import { useTapGuard } from '../../hooks/useTapGuard'

const KitchenSection = () => {
  const { t } = useTranslation()
  const router = useRouter()
  const acceptTap = useTapGuard()
  const { preferences } = usePreferences()
  const { activeHousehold } = useHousehold()

  const avoided = activeHousehold?.allergens ?? preferences?.personal_allergens ?? []
  const avoidedLabel = avoided.length > 0 ? t('settings.avoidedCount', { count: avoided.length }) : t('settings.nothingAvoided')
  const categoryCount = preferences?.shopping_categories.length
  const categoryLabel = categoryCount === undefined ? undefined : String(categoryCount)

  const handleOpenCategories = useCallback(() => {
    if (acceptTap()) router.push('/(tabs)/settings/shopping-categories')
  }, [acceptTap, router])

  const handleOpenAllergies = useCallback(() => {
    if (acceptTap()) router.push('/(tabs)/settings/allergies')
  }, [acceptTap, router])

  return (
    <>
      <SectionHeader variant="caption" title={t('settings.kitchen')} />
      <SettingsGroup>
        <SettingsRow
          icon="cart"
          title={t('settings.shoppingCategories')}
          value={categoryLabel}
          accessory="chevron"
          onPress={handleOpenCategories}
        />
        <SettingsRow
          icon="checkmark.shield"
          title={t('settings.allergiesIntolerances')}
          value={avoidedLabel}
          accessory="chevron"
          onPress={handleOpenAllergies}
        />
      </SettingsGroup>
    </>
  )
}

export default KitchenSection
