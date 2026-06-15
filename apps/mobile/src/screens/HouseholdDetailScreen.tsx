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
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useHouseholds } from '@platekeeper/shared/hooks/useHouseholds'
import { useMembers } from '@platekeeper/shared/hooks/useMembers'
import { useAuth } from '../context/AuthContext'
import type { SettingsStackParamList } from '../navigation/SettingsStack'
import { colors } from '../theme/colors'

type Props = NativeStackScreenProps<SettingsStackParamList, 'HouseholdDetail'>

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

const HouseholdDetailScreen = ({ route, navigation }: Props) => {
  const { householdId } = route.params
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
      navigation.setOptions({ title: name.trim() || householdId })
    } catch (e) {
      Alert.alert(t('common.ok'), e instanceof Error ? e.message : t('settings.failedToSave'))
    } finally {
      setSaving(false)
    }
  }, [householdId, name, color, update, navigation, t])

  const handleInvite = useCallback(async () => {
    const email = inviteEmail.trim()
    if (!email) return
    setInviting(true)
    try {
      await invite.mutateAsync({ householdId, email })
      setInviteEmail('')
      Alert.alert(t('common.ok'), t('settings.invitationSent'))
    } catch (e) {
      Alert.alert(t('common.ok'), e instanceof Error ? e.message : 'Error')
    } finally {
      setInviting(false)
    }
  }, [householdId, inviteEmail, invite, t])

  const handleLeave = useCallback(() => {
    Alert.alert(t('settings.leaveHousehold'), t('settings.areYouSure'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.leaveHousehold'),
        style: 'destructive',
        onPress: async () => {
          try {
            await leave.mutateAsync(householdId)
            if (user?.active_household_id === householdId) {
              await refreshUser()
            }
            navigation.goBack()
          } catch (e) {
            Alert.alert(t('common.ok'), e instanceof Error ? e.message : 'Error')
          }
        },
      },
    ])
  }, [householdId, leave, user, refreshUser, navigation, t])

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
    >
      {/* Name */}
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

      {/* Color */}
      <Text style={styles.sectionHeader}>{t('settings.colorLabel')}</Text>
      <View style={[styles.card, styles.colorRow]}>
        {PRESET_COLORS.map((c) => (
          <Pressable
            key={c}
            onPress={() => setColor(c)}
            style={({ pressed }) => [
              styles.colorDot,
              { backgroundColor: c },
              color === c && styles.colorDotSelected,
              pressed && { opacity: 0.7 },
            ]}
            accessibilityLabel={c}
            accessibilityRole="radio"
            accessibilityState={{ checked: color === c }}
          />
        ))}
      </View>

      <Pressable
        style={({ pressed }) => [styles.saveBtn, saving && styles.saveBtnDisabled, pressed && { opacity: 0.7 }]}
        onPress={handleSave}
        disabled={saving}
        accessibilityLabel={t('settings.saveChanges')}
        accessibilityRole="button"
      >
        <Text style={styles.saveBtnText}>
          {saving ? t('common.saving') : t('settings.saveChanges')}
        </Text>
      </Pressable>

      {/* Members */}
      <Text style={styles.sectionHeader}>{t('settings.members')}</Text>
      <View style={styles.card}>
        {membersLoading ? (
          <ActivityIndicator style={{ padding: 12 }} />
        ) : (
          (members ?? []).map((m) => (
            <View key={m.user_id.toString()} style={styles.memberRow}>
              <View style={styles.memberAvatar}>
                <Text style={styles.memberAvatarText}>
                  {(m.nickname || m.email)[0].toUpperCase()}
                </Text>
              </View>
              <Text style={styles.memberName} numberOfLines={1}>
                {m.nickname || m.email}
              </Text>
            </View>
          ))
        )}
      </View>

      {/* Invite */}
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
            accessibilityLabel={t('settings.inviteByEmail')}
          />
          <Pressable
            style={({ pressed }) => [styles.inviteBtn, inviting && styles.inviteBtnDisabled, pressed && { opacity: 0.7 }]}
            onPress={handleInvite}
            disabled={inviting}
            accessibilityLabel={t('common.invite')}
            accessibilityRole="button"
          >
            <Text style={styles.inviteBtnText}>{t('common.invite')}</Text>
          </Pressable>
        </View>
      </View>

      {/* Leave */}
      <View style={styles.leaveSection}>
        <Pressable
          style={({ pressed }) => [styles.leaveBtn, pressed && { opacity: 0.7 }]}
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
  errorText: { color: colors.red, fontSize: 15 },
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
    fontSize: 15,
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
  saveBtn: {
    backgroundColor: colors.blue,
    borderRadius: 10,
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: colors.background, fontSize: 15, fontWeight: '600' },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.secondaryBackground,
  },
  memberAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.opaqueSeparator,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  memberAvatarText: { fontSize: 13, fontWeight: '700', color: colors.secondaryLabel },
  memberName: { flex: 1, fontSize: 14, color: colors.label },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  inviteInput: {
    flex: 1,
    fontSize: 14,
    color: colors.label,
    borderWidth: 1,
    borderColor: colors.opaqueSeparator,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  inviteBtn: {
    backgroundColor: colors.secondaryBackground,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: colors.opaqueSeparator,
  },
  inviteBtnDisabled: { opacity: 0.5 },
  inviteBtnText: { fontSize: 14, fontWeight: '600', color: colors.secondaryLabel },
  leaveSection: { marginHorizontal: 16, marginTop: 32 },
  leaveBtn: {
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: colors.brandLight,
  },
  leaveBtnText: { color: colors.red, fontSize: 15, fontWeight: '600' },
})

export default HouseholdDetailScreen
