import { useTranslation } from 'react-i18next'
import { SectionHeader, SettingsGroup, SettingsRow } from '../../components/ui'
import { useAccountActions } from './useAccountActions'

const DangerSection = () => {
  const { t } = useTranslation()
  const { isDeleting, handleLogout, handleDeleteAccount } = useAccountActions()

  return (
    <>
      <SectionHeader variant="caption" title={t('settings.dangerZone')} />
      <SettingsGroup>
        <SettingsRow
          icon="rectangle.portrait.and.arrow.right"
          title={t('settings.logOut')}
          tone="destructive"
          onPress={handleLogout}
        />
        <SettingsRow
          title={t('settings.deleteAccount')}
          tone="destructive"
          loading={isDeleting}
          onPress={handleDeleteAccount}
        />
      </SettingsGroup>
    </>
  )
}

export default DangerSection
