import { useCallback } from 'react'
import { Linking } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { SectionHeader, SettingsGroup, SettingsRow } from '../../components/ui'
import { useTapGuard } from '../../hooks/useTapGuard'
import { PRIVACY_POLICY_URL } from './helpers'

const HelpSection = () => {
  const { t } = useTranslation()
  const router = useRouter()
  const acceptTap = useTapGuard()

  const handleReportIssue = useCallback(() => {
    if (acceptTap()) router.push('/bug-report')
  }, [acceptTap, router])

  const handleOpenPrivacyPolicy = useCallback(() => {
    if (acceptTap()) void Linking.openURL(PRIVACY_POLICY_URL)
  }, [acceptTap])

  return (
    <>
      <SectionHeader variant="caption" title={t('settings.help')} />
      <SettingsGroup>
        <SettingsRow
          icon="exclamationmark.bubble"
          title={t('settings.reportIssue')}
          accessory="chevron"
          onPress={handleReportIssue}
        />
        <SettingsRow
          icon="lock"
          title={t('settings.privacyPolicy')}
          accessibilityRole="link"
          accessory="chevron"
          onPress={handleOpenPrivacyPolicy}
        />
      </SettingsGroup>
    </>
  )
}

export default HelpSection
