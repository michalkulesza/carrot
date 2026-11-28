import { memo, useCallback, useMemo } from 'react'
import { View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useMembers } from '@carrot/shared/hooks/useMembers'
import type { HouseholdOut } from '@carrot/shared/types'
import Avatar from '../../components/Avatar'
import { AppText, Button, SectionHeader, SettingsGroup, SettingsRow } from '../../components/ui'
import { useHousehold } from '../../context/HouseholdContext'
import { useTapGuard } from '../../hooks/useTapGuard'
import { useHouseholdActions } from './useHouseholdActions'
import { styles } from './styles'

const AVATAR_SIZE = 36

interface HouseholdRowProps {
  household: HouseholdOut
  active: boolean
  memberCount: number | null
  switching: boolean
  onManage: (household: HouseholdOut) => void
  onSwitch: (id: string) => void
}

const HouseholdRow = memo(({ household, active, memberCount, switching, onManage, onSwitch }: HouseholdRowProps) => {
  const { t } = useTranslation()

  const subtitle = active
    ? memberCount === null
      ? t('settings.active')
      : t('settings.currentPeople', { count: memberCount })
    : undefined
  const handleManage = useCallback(() => onManage(household), [household, onManage])
  const handleSwitch = useCallback(() => onSwitch(household.id), [household.id, onSwitch])

  const avatar = useMemo(
    () => <Avatar name={household.name} color={household.color} size={AVATAR_SIZE} shape="rounded" />,
    [household.name, household.color],
  )
  const manageButton = useMemo(
    () => <Button variant="surface" size="sm" label={t('settings.manage')} onPress={handleManage} />,
    [t, handleManage],
  )
  const switchLabel = useMemo(
    () => (
      <AppText variant="button" accessibilityElementsHidden>
        {t('settings.switchHousehold')}
      </AppText>
    ),
    [t],
  )

  if (active) {
    return <SettingsRow leading={avatar} title={household.name} subtitle={subtitle} accessory={manageButton} />
  }

  return (
    <SettingsRow
      leading={avatar}
      title={household.name}
      accessory={switchLabel}
      loading={switching}
      onPress={handleSwitch}
      accessibilityLabel={`${t('settings.switchHousehold')} ${household.name}`}
    />
  )
})

const HouseholdsSection = () => {
  const { t } = useTranslation()
  const router = useRouter()
  const acceptTap = useTapGuard()
  const { households, activeHouseholdId } = useHousehold()
  const { members } = useMembers(activeHouseholdId)
  const { switchingId, handleSwitch, handleCreateHousehold, handleJoinByCode } = useHouseholdActions()

  const memberCount = activeHouseholdId && members.length > 0 ? members.length : null
  const orderedHouseholds = useMemo(
    () => [...households].sort((a, b) => Number(b.id === activeHouseholdId) - Number(a.id === activeHouseholdId)),
    [households, activeHouseholdId],
  )

  const handleManage = useCallback(
    (household: HouseholdOut) => {
      if (!acceptTap()) return

      router.push({ pathname: '/household/[id]', params: { id: household.id, householdName: household.name } })
    },
    [acceptTap, router],
  )

  const handleCreatePress = useCallback(() => {
    if (acceptTap()) handleCreateHousehold()
  }, [acceptTap, handleCreateHousehold])

  const handleJoinPress = useCallback(() => {
    if (acceptTap()) handleJoinByCode()
  }, [acceptTap, handleJoinByCode])

  const footer = (
    <View style={styles.footerRow}>
      <View style={styles.footerButton}>
        <Button variant="surface" size="lg" fullWidth icon="plus" label={t('settings.newHouseholdButton')} onPress={handleCreatePress} />
      </View>
      <View style={styles.footerButton}>
        <Button variant="surface" size="lg" fullWidth label={t('settings.joinWithCode')} onPress={handleJoinPress} />
      </View>
    </View>
  )

  return (
    <>
      <SectionHeader variant="caption" title={t('settings.households')} />
      <SettingsGroup animated footer={footer}>
        {orderedHouseholds.length === 0 ? <SettingsRow key="empty" title={t('settings.noHouseholds')} /> : null}
        {orderedHouseholds.map((household) => (
          <HouseholdRow
            key={household.id}
            household={household}
            active={household.id === activeHouseholdId}
            memberCount={household.id === activeHouseholdId ? memberCount : null}
            switching={switchingId === household.id}
            onManage={handleManage}
            onSwitch={handleSwitch}
          />
        ))}
      </SettingsGroup>
    </>
  )
}

export default HouseholdsSection
