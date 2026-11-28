import { memo, useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import type { HouseholdOut } from '@carrot/shared/types'
import { AppText, Button, SegmentedControl } from '../../components/ui'
import { useAnnounce } from '../../hooks/useAnnounce'
import { palette, useMotion } from '../../theme'
import type { InviteTab } from './helpers'
import { styles } from './styles'
import { useInviteActions } from './useInviteActions'

interface InviteCardProps {
  household: HouseholdOut
  isAdmin: boolean
}

const InviteCard = ({ household, isAdmin }: InviteCardProps) => {
  const { t } = useTranslation()
  const { fade, exiting, layout } = useMotion()
  const [tab, setTab] = useState<InviteTab>('link')
  const [email, setEmail] = useState('')
  const { inviting, rotating, emailMessage, shareCode, openCodeMenu, sendInvite, clearEmailMessage } = useInviteActions(
    household,
    isAdmin,
  )

  useAnnounce(emailMessage?.text)

  const tabOptions = useMemo(
    () => [
      { value: 'link' as const, label: t('settings.inviteTabLink') },
      { value: 'email' as const, label: t('settings.inviteTabEmail') },
    ],
    [t],
  )

  const handleEmailChange = useCallback(
    (value: string) => {
      setEmail(value)
      if (emailMessage) clearEmailMessage()
    },
    [emailMessage, clearEmailMessage],
  )

  const handleSend = useCallback(async () => {
    if (await sendInvite(email)) setEmail('')
  }, [sendInvite, email])

  return (
    <Animated.View style={styles.inviteCard} layout={layout}>
      <View>
        <AppText variant="progressLabel">{t('settings.inviteSomeone')}</AppText>
        <AppText variant="meta" tone="textSecondary">
          {t('settings.inviteSomeoneDesc')}
        </AppText>
      </View>

      <SegmentedControl options={tabOptions} value={tab} onChange={setTab} />

      {tab === 'link' ? (
        <Animated.View key="link" entering={fade} exiting={exiting} style={styles.inviteRow}>
          <Pressable
            style={styles.field}
            onPress={openCodeMenu}
            accessibilityRole="button"
            accessibilityLabel={t('settings.inviteCode')}
            accessibilityValue={{ text: household.invite_code }}
          >
            {rotating ? (
              <ActivityIndicator />
            ) : (
              <AppText variant="bodyLarge" style={styles.codeText} numberOfLines={1} adjustsFontSizeToFit>
                {household.invite_code}
              </AppText>
            )}
          </Pressable>
          <Button label={t('settings.share')} icon="square.and.arrow.up" size="lg" onPress={shareCode} />
        </Animated.View>
      ) : (
        <Animated.View key="email" entering={fade} exiting={exiting}>
          <View style={styles.inviteRow}>
            <View style={styles.field}>
              <TextInput
                style={styles.emailInput}
                value={email}
                onChangeText={handleEmailChange}
                placeholder={t('settings.inviteEmailPlaceholder')}
                placeholderTextColor={palette.placeholder}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="emailAddress"
                returnKeyType="send"
                onSubmitEditing={handleSend}
                accessibilityLabel={t('settings.inviteByEmail')}
              />
            </View>
            <Button
              label={t('settings.send')}
              size="lg"
              onPress={handleSend}
              loading={inviting}
              disabled={!email.trim()}
            />
          </View>
          {emailMessage ? (
            <AppText
              variant="meta"
              tone={emailMessage.success ? 'success' : 'error'}
              style={styles.inviteMessage}
              accessibilityLiveRegion="polite"
            >
              {emailMessage.text}
            </AppText>
          ) : null}
        </Animated.View>
      )}
    </Animated.View>
  )
}

export default memo(InviteCard)
