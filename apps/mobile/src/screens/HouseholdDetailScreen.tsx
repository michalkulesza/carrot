import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useHouseholds } from '@carrot/shared/hooks/useHouseholds'
import { useMembers } from '@carrot/shared/hooks/useMembers'
import type { MemberOut } from '@carrot/shared/types'
import { useAuth } from '../context/AuthContext'
import Avatar from '../components/Avatar'
import { colors } from '../theme/colors'

const PRESET_COLORS = [
  '#6366f1',
  '#ec4899',
  '#14b8a6',
  '#f59e0b',
  '#22c55e',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
]

interface HeaderSaveButtonProps {
  saving: boolean
  isDirty: boolean
  onPress: () => void
}

const HeaderSaveButton = ({ saving, isDirty, onPress }: HeaderSaveButtonProps) => {
  const { t } = useTranslation()

  if (saving) {
    return <ActivityIndicator style={styles.headerSaveBtn} />
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={!isDirty}
      hitSlop={8}
      style={styles.headerSaveBtn}
      accessibilityLabel={t('settings.saveChanges')}
      accessibilityRole="button"
    >
      <Text style={[styles.headerSaveText, !isDirty && styles.headerSaveTextDisabled]}>
        {t('common.save')}
      </Text>
    </Pressable>
  )
}

const MemberRow = ({ member }: { member: MemberOut }) => (
  <View style={styles.memberRow}>
    <Avatar name={member.nickname || member.email} size={32} />
    <Text style={styles.memberName} numberOfLines={1}>
      {member.nickname || member.email}
    </Text>
  </View>
)

interface MembersListProps {
  loading: boolean
  members: MemberOut[] | undefined
}

const MembersList = ({ loading, members }: MembersListProps) => {
  if (loading) {
    return <ActivityIndicator style={styles.membersLoading} />
  }

  return (
    <>
      {(members ?? []).map((m) => (
        <MemberRow key={m.user_id.toString()} member={m} />
      ))}
    </>
  )
}

const HouseholdDetailScreen = () => {
  const { id: householdId } = useLocalSearchParams<{ id: string; householdName?: string }>()
  const router = useRouter()
  const { t } = useTranslation()
  const { user, refreshUser } = useAuth()
  const { households, update, leave, invite } = useHouseholds()
  const { data: members, isLoading: membersLoading } = useMembers(householdId)
  const insets = useSafeAreaInsets()

  const household = households.find((h) => h.id === householdId)
  const [name, setName] = useState(household?.name ?? '')
  const [color, setColor] = useState(household?.color ?? PRESET_COLORS[0])
  const [inviteEmail, setInviteEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [inviting, setInviting] = useState(false)

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await update.mutateAsync({ id: householdId, data: { name: name.trim() || undefined, color } })
    } catch (e) {
      Alert.alert(t('common.ok'), e instanceof Error ? e.message : t('settings.failedToSave'))
    } finally {
      setSaving(false)
    }
  }, [householdId, name, color, update, t])

  const isDirty = name.trim() !== (household?.name ?? '') || color !== (household?.color ?? PRESET_COLORS[0])

  const getPressableStyle = useCallback(
    (c: string) =>
      ({ pressed }: { pressed: boolean }) => [
        styles.colorDot,
        { backgroundColor: c },
        color === c && styles.colorDotSelected,
        pressed && { opacity: 0.7 },
      ],
    [color],
  )

  const handleInvite = useCallback(async () => {
    const email = inviteEmail.trim()
    if (!email) return
    setInviting(true)
    try {
      await invite.mutateAsync({ householdId, email })
      setInviteEmail('')
      Alert.alert(t('common.ok'), t('settings.invitationSent'))
    } catch (e) {
      Alert.alert(t('common.ok'), e instanceof Error ? e.message : t('settings.invitationFailed'))
    } finally {
      setInviting(false)
    }
  }, [householdId, inviteEmail, invite, t])

  const handleLeaveOnPress = useCallback(async () => {
    try {
      await leave.mutateAsync(householdId)
      if (user?.active_household_id === householdId) {
        await refreshUser()
      }
      router.back()
    } catch (e) {
      Alert.alert(t('common.ok'), e instanceof Error ? e.message : t('settings.leaveFailed'))
    }
  }, [householdId, leave, user, refreshUser, router, t])

  const handleLeave = useCallback(() => {
    Alert.alert(t('settings.leaveHousehold'), t('settings.areYouSure'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.leaveHousehold'),
        style: 'destructive',
        onPress: handleLeaveOnPress,
      },
    ])
  }, [t, handleLeaveOnPress])

  const getLeaveRowStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [styles.leaveRow, pressed && styles.leaveRowPressed],
    [],
  )

  if (!household) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{t('recipes.noResults')}</Text>
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: 48 + insets.bottom }]}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => <HeaderSaveButton saving={saving} isDirty={isDirty} onPress={handleSave} />,
        }}
      />
      <Text style={styles.sectionHeader}>{t('settings.nameLabel')}</Text>
      <View style={styles.card}>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder={t('settings.householdNamePlaceholder')}
          accessibilityLabel={t('settings.nameLabel')}
        />
      </View>

      <Text style={styles.sectionHeader}>{t('settings.colorLabel')}</Text>
      <View style={[styles.card, styles.colorRow]}>
        {PRESET_COLORS.map((c) => (
          <Pressable
            key={c}
            onPress={() => setColor(c)}
            style={getPressableStyle(c)}
            accessibilityLabel={c}
            accessibilityRole="radio"
            accessibilityState={{ checked: color === c }}
          />
        ))}
      </View>

      <Text style={styles.sectionHeader}>{t('settings.members')}</Text>
      <View style={styles.card}>
        <MembersList loading={membersLoading} members={members} />
      </View>

      <Text style={styles.sectionHeader}>{t('settings.inviteByEmail')}</Text>
      <View style={styles.card}>
        <View style={styles.inviteRow}>
          <TextInput
            style={styles.inviteInput}
            value={inviteEmail}
            onChangeText={setInviteEmail}
            placeholder={t('settings.inviteEmailPlaceholder')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="emailAddress"
            returnKeyType="send"
            onSubmitEditing={handleInvite}
            accessibilityLabel={t('settings.inviteByEmail')}
          />
          {inviting ? (
            <ActivityIndicator style={styles.inviteSpinner} />
          ) : (
            <Pressable
              onPress={handleInvite}
              disabled={!inviteEmail.trim()}
              hitSlop={8}
              accessibilityLabel={t('common.invite')}
              accessibilityRole="button"
            >
              <Text style={[styles.inviteBtnText, !inviteEmail.trim() && styles.inviteBtnTextDisabled]}>
                {t('common.invite')}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      <View style={[styles.card, styles.leaveSection]}>
        <Pressable
          style={getLeaveRowStyle}
          onPress={handleLeave}
          accessibilityLabel={t('settings.leaveHousehold')}
          accessibilityRole="button"
        >
          <Text style={styles.leaveBtnText}>{t('settings.leaveHousehold')}</Text>
        </Pressable>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { color: colors.red, fontSize: 16 },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.secondaryLabel,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 8,
  },
  card: {
    backgroundColor: colors.background,
    borderRadius: 10,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
    overflow: 'hidden',
  },
  input: {
    fontSize: 16,
    color: colors.label,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 10,
  },
  colorDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  colorDotSelected: {
    borderWidth: 3,
    borderColor: colors.background,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  headerSaveBtn: { paddingHorizontal: 16, paddingVertical: 8 },
  headerSaveText: { color: colors.blue, fontSize: 17, fontWeight: '600' },
  headerSaveTextDisabled: { color: colors.secondaryLabel, opacity: 0.5 },
  membersLoading: { padding: 12 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.secondaryBackground,
  },
  memberName: { flex: 1, fontSize: 16, color: colors.label },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  inviteInput: {
    flex: 1,
    fontSize: 16,
    color: colors.label,
    borderWidth: 1,
    borderColor: colors.opaqueSeparator,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  inviteSpinner: { marginRight: 4 },
  inviteBtnText: { fontSize: 16, fontWeight: '600', color: colors.blue },
  inviteBtnTextDisabled: { color: colors.secondaryLabel, opacity: 0.5 },
  leaveSection: { marginTop: 32 },
  leaveRow: {
    paddingVertical: 13,
    alignItems: 'center',
  },
  leaveRowPressed: { backgroundColor: colors.secondaryBackground },
  leaveBtnText: { color: colors.red, fontSize: 16, fontWeight: '400' },
})

export default HouseholdDetailScreen
