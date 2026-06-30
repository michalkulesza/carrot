import { useEffect, useState } from 'react'
import { useLocalSearchParams, Redirect } from 'expo-router'
import { File, Paths } from 'expo-file-system'
import { SHARE_APP_GROUP, PENDING_SHARE_FILENAME } from '../src/utils/pendingShare'

type ShareParams = { type?: string; value?: string }

export default function ShareRedirect() {
  const params = useLocalSearchParams<ShareParams>()
  const [resolved, setResolved] = useState<ShareParams | null>(params.type === 'image' ? null : params)

  useEffect(() => {
    // The deep link succeeded, so the pending-share manifest the extension also wrote as a
    // fallback is now redundant — remove it so the app doesn't re-process it on next foreground.
    const container = Paths.appleSharedContainers[SHARE_APP_GROUP]
    if (container) {
      try {
        new File(container, PENDING_SHARE_FILENAME).delete()
      } catch {
        // best-effort cleanup
      }
    }
  }, [])

  useEffect(() => {
    if (params.type !== 'image' || !params.value) return
    const container = Paths.appleSharedContainers[SHARE_APP_GROUP]
    if (!container) {
      setResolved({})
      return
    }
    const file = new File(container, params.value)
    if (!file.exists) {
      setResolved({})
      return
    }
    file
      .base64()
      .then((base64) => {
        setResolved({ type: 'image', value: base64 })
        try {
          file.delete()
        } catch {
          // best-effort cleanup of the shared container file
        }
      })
      .catch(() => setResolved({}))
  }, [params.type, params.value])

  if (!resolved) return null
  return <Redirect href={{ pathname: '/import-recipe', params: resolved }} />
}
