import { File, Paths } from 'expo-file-system'

export const SHARE_APP_GROUP = 'group.com.kulesza.platekeeper'
export const PENDING_SHARE_FILENAME = 'shared_payload.json'

export type PendingShare = { type: string; value: string }

// Cheap sync check so callers can decide whether to block the UI before doing the
// (slower, async) consume — avoids flashing a loading state on every foreground when
// there's nothing to process.
export function hasPendingShare(): boolean {
  const container = Paths.appleSharedContainers[SHARE_APP_GROUP]
  if (!container) return false
  return new File(container, PENDING_SHARE_FILENAME).exists
}

// The Share Extension's deep-link handoff (extensionContext.open()) is declined by some
// host apps (e.g. Photos), even though everything up to that point succeeds. As a fallback,
// the extension always writes a pending-share manifest to the App Group container; the main
// app checks for it on launch/foreground so a share is never silently lost.
export async function consumePendingShare(): Promise<PendingShare | null> {
  const container = Paths.appleSharedContainers[SHARE_APP_GROUP]
  if (!container) return null

  const manifestFile = new File(container, PENDING_SHARE_FILENAME)
  if (!manifestFile.exists) return null

  let manifest: { type?: string; value?: string } | null = null
  try {
    manifest = await manifestFile.json()
  } catch {
    manifest = null
  }
  try {
    manifestFile.delete()
  } catch {
    // best-effort cleanup
  }

  if (!manifest?.type || !manifest.value) return null

  if (manifest.type === 'image') {
    const imageFile = new File(container, manifest.value)
    if (!imageFile.exists) return null
    try {
      const base64 = await imageFile.base64()
      try {
        imageFile.delete()
      } catch {
        // best-effort cleanup
      }
      return { type: 'image', value: base64 }
    } catch {
      return null
    }
  }

  return { type: manifest.type, value: manifest.value }
}
