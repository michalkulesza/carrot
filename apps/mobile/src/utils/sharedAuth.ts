import { File, Paths } from 'expo-file-system'
import { SHARE_APP_GROUP } from './pendingShare'

const SHARED_AUTH_FILENAME = 'shared_auth.json'

// Lets the Share Extension call the API directly; kept in sync with the in-memory token in api/client.ts.
export function syncSharedAuth(token: string | null): void {
  const container = Paths.appleSharedContainers[SHARE_APP_GROUP]
  if (!container) return

  const file = new File(container, SHARED_AUTH_FILENAME)
  if (!token) {
    try {
      file.delete()
    } catch {
      // best-effort cleanup
    }
    return
  }

  try {
    file.write(JSON.stringify({ token, apiBaseUrl: process.env.EXPO_PUBLIC_API_URL ?? '' }))
  } catch {
    // best-effort — the extension just falls back to its persist-and-deep-link path
  }
}
