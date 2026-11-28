import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Stack, useLocalSearchParams } from 'expo-router'
import { useHouseholds } from '@carrot/shared/hooks/useHouseholds'
import { AppText, EnterSection, SectionHeader, SettingsGroup, SettingsRow } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useEdgeEffectHeader } from '../../hooks/useEdgeEffectHeader'
import { useInsetContentStyle } from '../../hooks/useInsetContentStyle'
import { space } from '../../theme'
import IdentityHeader from './IdentityHeader'
import InviteCard from './InviteCard'
import MembersSection from './MembersSection'
import { styles } from './styles'
import { useHouseholdIdentity } from './useHouseholdIdentity'
import { useLeaveHousehold } from './useLeaveHousehold'
import { useMemberActions } from './useMemberActions'

const CONTENT_PADDING_TOP = space.xs
const CONTENT_PADDING_BOTTOM = space.xxl

const HouseholdDetailScreen = () => {
  const { id: householdId } = useLocalSearchParams<{ id: string; householdName?: string }>()
  const { t } = useTranslation()
  const { user } = useAuth()
  const { households, isLoading: householdsLoading } = useHouseholds()
  const household = households.find((candidate) => candidate.id === householdId)

  const { color, selectColor, promptRename } = useHouseholdIdentity(household)
  const { members, isLoading, busyUserId, openMemberMenu } = useMemberActions(householdId)
  const { leaving, handleLeave } = useLeaveHousehold(householdId)

  const isAdmin = members.find((member) => member.user_id === user?.id)?.role === 'admin'
  const headerOptions = useEdgeEffectHeader(t('settings.householdTitle'))
  const contentStyle = useInsetContentStyle(CONTENT_PADDING_BOTTOM, CONTENT_PADDING_TOP)

  if (!household) {
    if (leaving) return null

    return (
      <View style={styles.center}>
        <Stack.Screen options={headerOptions} />
        {householdsLoading ? (
          <ActivityIndicator accessibilityLabel={t('common.loading')} />
        ) : (
          <AppText variant="body" tone="error">
            {t('settings.householdNotFound')}
          </AppText>
        )}
      </View>
    )
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={contentStyle}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        <Stack.Screen options={headerOptions} />

        <EnterSection index={0}>
          <IdentityHeader
            household={household}
            color={color}
            memberCount={members.length}
            onRename={promptRename}
            onSelectColor={selectColor}
          />
        </EnterSection>

        <EnterSection index={1}>
          <InviteCard household={household} isAdmin={isAdmin} />
        </EnterSection>

        <EnterSection index={2}>
          <MembersSection
            loading={isLoading}
            members={members}
            isAdmin={isAdmin}
            currentUserId={user?.id}
            busyUserId={busyUserId}
            onEdit={openMemberMenu}
          />
        </EnterSection>

        <EnterSection index={3}>
          <SectionHeader variant="caption" title={t('settings.dangerZone')} />
          <SettingsGroup>
            <SettingsRow
              title={t('settings.leaveHousehold')}
              tone="destructive"
              loading={leaving}
              onPress={handleLeave}
            />
          </SettingsGroup>
        </EnterSection>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

export default HouseholdDetailScreen
