import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert } from 'react-native'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'
import { useShoppingList } from '@carrot/shared/hooks/useShoppingList'
import { lightHaptic } from '../../components/ui/haptics'
import { createShoppingListItemInput } from '../../utils/uuid'
import type { IngredientEntry } from './helpers'

const TOAST_DURATION_MS = 4000

interface AddedBatch {
  ids: string[]
  added: Promise<unknown>
  token: number
}

interface ToastState {
  count: number
  token: number
}

export const useGroceryMode = (entries: IngredientEntry[]) => {
  const { t } = useTranslation()
  const { addItems, remove } = useShoppingList()
  const [active, setActive] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<ToastState | null>(null)
  const confirmableRef = useRef(false)
  const batchRef = useRef<AddedBatch | null>(null)
  const toastTokenRef = useRef(0)

  const toastToken = toast?.token

  useEffect(() => {
    if (toastToken === undefined) return

    const timer = setTimeout(() => {
      setToast(null)
      if (batchRef.current?.token === toastToken) batchRef.current = null
    }, TOAST_DURATION_MS)

    return () => clearTimeout(timer)
  }, [toastToken])

  const selectedEntries = useMemo(
    () => entries.filter((entry) => selectedKeys.has(entry.key)),
    [entries, selectedKeys],
  )

  const handleEnter = useCallback(() => {
    lightHaptic()
    confirmableRef.current = true
    setSelectedKeys(new Set())
    setActive(true)
  }, [])

  const handleCancel = useCallback(() => {
    confirmableRef.current = false
    setActive(false)
    setSelectedKeys(new Set())
  }, [])

  const handleToggle = useCallback((key: string) => {
    lightHaptic()
    setSelectedKeys((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const allSelected = entries.length > 0 && selectedKeys.size === entries.length

  const handleToggleAll = useCallback(() => {
    lightHaptic()
    setSelectedKeys(allSelected ? new Set() : new Set(entries.map((entry) => entry.key)))
  }, [allSelected, entries])

  const handleConfirm = useCallback(() => {
    if (!confirmableRef.current || selectedEntries.length === 0) return

    const submittedKeys = selectedEntries.map((entry) => entry.key)
    const items = selectedEntries.map((entry) =>
      createShoppingListItemInput(entry.shoppingListValue, entry.shoppingCategory),
    )

    const ids = items.map((item) => item.id)
    const token = ++toastTokenRef.current
    const added = addItems.mutateAsync(items)
    batchRef.current = { ids, added, token }

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    handleCancel()
    setToast({ count: ids.length, token })

    added.catch(() => {
      if (toastTokenRef.current === token) setToast(null)
      if (batchRef.current?.token === token) batchRef.current = null

      confirmableRef.current = true
      setSelectedKeys((previous) => new Set([...previous, ...submittedKeys]))
      setActive(true)
      Alert.alert(t('common.somethingWentWrong'))
    })
  }, [selectedEntries, handleCancel, addItems, t])

  const handleUndo = useCallback(async () => {
    const batch = batchRef.current
    if (!batch) return

    setToast(null)
    batchRef.current = null
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)

    try {
      await batch.added
    } catch {
      return
    }

    const results = await Promise.allSettled(batch.ids.map((id) => remove.mutateAsync(id)))
    if (results.some((result) => result.status === 'rejected')) Alert.alert(t('common.somethingWentWrong'))
  }, [remove, t])

  return {
    active,
    selectedKeys,
    selectedCount: selectedEntries.length,
    allSelected,
    handleEnter,
    handleCancel,
    handleToggle,
    handleToggleAll,
    handleConfirm,
    handleUndo,
    toastCount: toast?.count ?? null,
  }
}
