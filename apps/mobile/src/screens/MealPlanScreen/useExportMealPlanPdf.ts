import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as Sharing from 'expo-sharing'
import { File, Paths } from 'expo-file-system'
import { getToken } from '../../api/client'

export const useExportMealPlanPdf = (currentMonth: string) => {
  const { t } = useTranslation()
  const [exporting, setExporting] = useState(false)

  const handleExportPdf = useCallback(async () => {
    setExporting(true)
    const startedAt = Date.now()
    try {
      const baseUrl = (process.env.EXPO_PUBLIC_API_URL as string | undefined) ?? ''
      const token = getToken()
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
      const res = await fetch(`${baseUrl}/api/export/meal-plan.pdf?month=${currentMonth}`, {
        headers,
        credentials: 'omit',
      })
      if (!res.ok) throw new Error(t('shoppingList.exportError'))
      const bytes = new Uint8Array(await res.arrayBuffer())
      const file = new File(Paths.cache, `meal-plan-${currentMonth}.pdf`)
      file.write(bytes)
      const canShare = await Sharing.isAvailableAsync()
      if (!canShare) throw new Error(t('shoppingList.exportError'))

      const elapsed = Date.now() - startedAt
      if (elapsed < 1000) await new Promise<void>(resolve => setTimeout(resolve, 1000 - elapsed))
      setExporting(false)

      await new Promise<void>(resolve => setTimeout(resolve, 100))
      await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' })
    } catch {
      // Dismissing the share sheet also lands here — no error to surface.
      setExporting(false)
    }
  }, [currentMonth, t])

  return { exporting, handleExportPdf }
}
