import { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Stack } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useApiClient } from '@carrot/shared/api/context'
import { useHouseholds } from '@carrot/shared/hooks/useHouseholds'
import BellMenu from '../../components/BellMenu'
import HeaderTitle from '../../components/HeaderTitle'
import { useAuth } from '../../context/AuthContext'
import { useHousehold } from '../../context/HouseholdContext'
import InvitationRow from './InvitationRow'
import { styles } from './styles'

const GettingStartedHeaderRight = () => (
  <View style={styles.headerRight}>
    <BellMenu />
  </View>
)

const GettingStartedHeaderTitle = () => {
  const { t } = useTranslation()

  return <HeaderTitle title={t('nav.gettingStarted')} />
}

const renderGettingStartedHeaderTitle = () => <GettingStartedHeaderTitle />

const gettingStartedHeaderOptions = {
  headerTitle: renderGettingStartedHeaderTitle,
  headerRight: GettingStartedHeaderRight,
}

const GettingStartedScreen = () => {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const api = useApiClient()
  const { refreshUser } = useAuth()
  const { invitations, refetchHouseholds, refetchInvitations } = useHousehold()
  const { create: createHousehold, joinByCode } = useHouseholds()
  const [busyInvitationId, setBusyInvitationId] = useState<string | null>(null)
  const [creatingHousehold, setCreatingHousehold] = useState(false)

  const handleAcceptInvitation = useCallback(
    async (id: string) => {
      setBusyInvitationId(id)
      try {
        await api.acceptInvitation(id)
        await refreshUser()
        refetchInvitations()
        refetchHouseholds()
      } catch (e) {
        Alert.alert(t('common.somethingWentWrong'), e instanceof Error ? e.message : t('bell.acceptInvitationFailed'))
      } finally {
        setBusyInvitationId(null)
      }
    },
    [api, refetchHouseholds, refetchInvitations, refreshUser, t],
  )

  const handleHouseholdNameSubmit = useCallback(
    async (name?: string) => {
      const trimmed = name?.trim() ?? ''
      if (trimmed.length < 3) {
        Alert.alert(t('common.somethingWentWrong'), t('settings.householdNameTooShort'))
        return
      }
      setCreatingHousehold(true)
      try {
        await createHousehold.mutateAsync({ name: trimmed })
        await refreshUser()
        refetchHouseholds()
      } catch (e) {
        Alert.alert(t('common.somethingWentWrong'), e instanceof Error ? e.message : 'Error')
      } finally {
        setCreatingHousehold(false)
      }
    },
    [createHousehold, refetchHouseholds, refreshUser, t],
  )

  const handleCreateHousehold = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    Alert.prompt(
      t('settings.newHouseholdTitle'),
      t('settings.householdNameOptional'),
      handleHouseholdNameSubmit,
      'plain-text',
      '',
    )
  }, [t, handleHouseholdNameSubmit])

  const handleJoinCodeSubmit = useCallback(
    async (code?: string) => {
      if (!code?.trim()) return
      try {
        await joinByCode.mutateAsync(code.trim())
        await refreshUser()
        refetchHouseholds()
      } catch (e) {
        Alert.alert(t('common.somethingWentWrong'), e instanceof Error ? e.message : t('households.joinFailed'))
      }
    },
    [joinByCode, refetchHouseholds, refreshUser, t],
  )

  const handleJoinByCode = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    Alert.prompt(
      t('households.haveACode'),
      t('households.codePlaceholder'),
      handleJoinCodeSubmit,
      'plain-text',
      '',
    )
  }, [t, handleJoinCodeSubmit])

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: 48 + insets.bottom }]}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Stack.Screen options={gettingStartedHeaderOptions} />

      <Image
        source={require('../../../assets/icon.png')}
        style={styles.logo}
        resizeMode="contain"
        accessible={false}
      />

      <View style={styles.titleBlock}>
        <Text style={styles.title}>{t('households.gateTitle')}</Text>
        <Text style={styles.subtitle}>{t('households.gateSubtitle')}</Text>
      </View>

      <Pressable
        style={({ pressed }) => [styles.secondaryButton, pressed && { opacity: 0.8 }]}
        onPress={handleJoinByCode}
        accessibilityLabel={t('households.haveACode')}
        accessibilityRole="button"
      >
        <Text style={styles.secondaryButtonText}>{t('households.haveACode')}</Text>
      </Pressable>

      <View style={styles.invitationsCard}>
        <Text style={styles.invitationsLabel}>{t('households.haveYouBeenInvited')}</Text>
        {invitations.length > 0 ? (
          invitations.map((invitation, index) => (
            <InvitationRow
              key={invitation.id}
              invitation={invitation}
              busy={busyInvitationId === invitation.id}
              bordered={index > 0}
              onAccept={handleAcceptInvitation}
            />
          ))
        ) : (
          <Text style={styles.invitationsEmpty}>{t('households.noPendingInvites')}</Text>
        )}
      </View>

      <Pressable
        style={({ pressed }) => [styles.primaryButton, pressed && { opacity: 0.8 }]}
        onPress={handleCreateHousehold}
        disabled={creatingHousehold}
        accessibilityLabel={t('households.createAHousehold')}
        accessibilityRole="button"
      >
        {creatingHousehold ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <Text style={styles.primaryButtonText}>{t('households.createAHousehold')}</Text>
        )}
      </Pressable>
    </ScrollView>
  )
}

export default GettingStartedScreen
