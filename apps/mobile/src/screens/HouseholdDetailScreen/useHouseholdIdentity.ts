import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useHouseholds } from '@carrot/shared/hooks/useHouseholds'
import type { HouseholdOut } from '@carrot/shared/types'
import { usePrompt } from '../../context/DialogContext'
import { PRESET_COLORS } from './helpers'

export const useHouseholdIdentity = (household: HouseholdOut | undefined) => {
  const { t } = useTranslation()
  const { update } = useHouseholds()
  const prompt = usePrompt()
  const savedColor = household?.color ?? PRESET_COLORS[0]
  const [color, setColor] = useState(savedColor)
  const saveQueueRef = useRef(Promise.resolve())
  const pendingSavesRef = useRef(0)
  const renamingRef = useRef(false)

  useEffect(() => {
    if (pendingSavesRef.current === 0) setColor(savedColor)
  }, [savedColor])

  const showError = useCallback(
    (e: unknown) => Alert.alert(t('common.somethingWentWrong'), e instanceof Error ? e.message : t('settings.failedToSave')),
    [t],
  )

  const selectColor = useCallback(
    (next: string) => {
      if (!household) return

      setColor(next)
      pendingSavesRef.current += 1

      saveQueueRef.current = saveQueueRef.current
        .then(async () => {
          try {
            await update.mutateAsync({ id: household.id, data: { color: next } })
          } catch (e) {
            setColor(savedColor)
            showError(e)
          } finally {
            pendingSavesRef.current -= 1
          }
        })
    },
    [household, update, savedColor, showError],
  )

  const handleRenameSubmit = useCallback(
    async (input: string) => {
      const name = input.trim()
      if (!household || !name || name === household.name || renamingRef.current) return
      renamingRef.current = true

      try {
        await update.mutateAsync({ id: household.id, data: { name } })
      } catch (e) {
        showError(e)
      } finally {
        renamingRef.current = false
      }
    },
    [household, update, showError],
  )

  const promptRename = useCallback(async () => {
    const input = await prompt({
      title: t('settings.renameHousehold'),
      message: t('settings.nameLabel'),
      defaultValue: household?.name ?? '',
      confirmLabel: t('common.save'),
    })
    if (input !== null) await handleRenameSubmit(input)
  }, [prompt, t, handleRenameSubmit, household?.name])

  return { color, selectColor, promptRename }
}
