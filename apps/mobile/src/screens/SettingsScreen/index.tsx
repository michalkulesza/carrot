import { Stack } from 'expo-router'
import { ScrollView } from 'react-native'
import { useTranslation } from 'react-i18next'
import { EnterSection } from '../../components/ui'
import { useHousehold } from '../../context/HouseholdContext'
import { useEdgeEffectHeader } from '../../hooks/useEdgeEffectHeader'
import { useInsetContentStyle } from '../../hooks/useInsetContentStyle'
import { space } from '../../theme'
import DangerSection from './DangerSection'
import HelpSection from './HelpSection'
import HouseholdsSection from './HouseholdsSection'
import InvitationsSection from './InvitationsSection'
import KeepAwakeSection from './KeepAwakeSection'
import KitchenSection from './KitchenSection'
import PreferencesSection from './PreferencesSection'
import ProfileCard from './ProfileCard'
import { styles } from './styles'
import { useInvitationActions } from './useInvitationActions'

const CONTENT_PADDING_BOTTOM = space.xxl + space.lg

const SettingsScreen = () => {
  const { t } = useTranslation()
  const { invitations } = useHousehold()
  const { pendingIds, handleInvitationPress } = useInvitationActions()

  const headerOptions = useEdgeEffectHeader(t('nav.settings'))
  const contentStyle = useInsetContentStyle(CONTENT_PADDING_BOTTOM)

  return (
    <ScrollView style={styles.container} contentContainerStyle={contentStyle} contentInsetAdjustmentBehavior="automatic">
      <Stack.Screen options={headerOptions} />

      <EnterSection index={0}>
        <ProfileCard />
      </EnterSection>

      {invitations.length > 0 ? (
        <EnterSection index={1}>
          <InvitationsSection invitations={invitations} pendingIds={pendingIds} onPress={handleInvitationPress} />
        </EnterSection>
      ) : null}

      <EnterSection index={2}>
        <HouseholdsSection />
      </EnterSection>
      <EnterSection index={3}>
        <KitchenSection />
      </EnterSection>
      <EnterSection index={4}>
        <PreferencesSection />
      </EnterSection>
      <EnterSection index={5}>
        <KeepAwakeSection />
      </EnterSection>
      <EnterSection index={6}>
        <HelpSection />
      </EnterSection>
      <EnterSection index={7}>
        <DangerSection />
      </EnterSection>
    </ScrollView>
  )
}

export default SettingsScreen
