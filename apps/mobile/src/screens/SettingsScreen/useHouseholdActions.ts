import { useCallback, useRef, useState } from 'react'
import { Alert } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useHouseholds } from '@carrot/shared/hooks/useHouseholds'
import { useAuth } from '../../context/AuthContext'
import { useHousehold } from '../../context/HouseholdContext'
import { usePrompt } from '../../context/DialogContext'

const MIN_NAME_LENGTH = 3

export const useHouseholdActions = () => {
  const { t } = useTranslation()
  const { refreshUser } = useAuth()
  const { switchHousehold, refetchHouseholds } = useHousehold()
  const { create, joinByCode } = useHouseholds()
  const prompt = usePrompt()
  const busyRef = useRef(false)
  const [switchingId, setSwitchingId] = useState<string | null>(null)

  const runExclusive = useCallback(async (action: () => Promise<void>, fallbackError: string) => {
    if (busyRef.current) return
    busyRef.current = true

    try {
      await action()
    } catch (e) {
      Alert.alert(t('common.somethingWentWrong'), e instanceof Error ? e.message : fallbackError)
    } finally {
      busyRef.current = false
    }
  }, [t])

  const handleSwitch = useCallback(
    (id: string) => {
      if (busyRef.current) return Promise.resolve()
      setSwitchingId(id)

      return runExclusive(() => switchHousehold(id), t('common.somethingWentWrong')).finally(() => setSwitchingId(null))
    },
    [runExclusive, switchHousehold, t],
  )

  const handleNameSubmit = useCallback(
    async (name: string) => {
      const trimmed = name.trim()
      if (trimmed.length < MIN_NAME_LENGTH) {
        Alert.alert(t('common.somethingWentWrong'), t('settings.householdNameTooShort'))
        return
      }

      await runExclusive(async () => {
        await create.mutateAsync({ name: trimmed })
        await refreshUser()
        refetchHouseholds()
      }, t('settings.createHouseholdFailed'))
    },
    [create, refetchHouseholds, refreshUser, runExclusive, t],
  )

  const handleCodeSubmit = useCallback(
    async (code: string) => {
      if (!code.trim()) return

      await runExclusive(async () => {
        await joinByCode.mutateAsync(code.trim())
        await refreshUser()
        refetchHouseholds()
      }, t('households.joinFailed'))
    },
    [joinByCode, refetchHouseholds, refreshUser, runExclusive, t],
  )

  const handleCreateHousehold = useCallback(async () => {
    const name = await prompt({
      title: t('settings.newHouseholdTitle'),
      message: t('settings.householdNameOptional'),
      confirmLabel: t('common.create'),
    })
    if (name !== null) await handleNameSubmit(name)
  }, [prompt, t, handleNameSubmit])

  const handleJoinByCode = useCallback(async () => {
    const code = await prompt({
      title: t('households.haveACode'),
      message: t('households.codePlaceholder'),
      confirmLabel: t('households.join'),
      autoCapitalize: 'characters',
    })
    if (code !== null) await handleCodeSubmit(code)
  }, [prompt, t, handleCodeSubmit])

  return { switchingId, handleSwitch, handleCreateHousehold, handleJoinByCode }
}
