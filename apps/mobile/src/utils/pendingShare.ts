import { File, Paths } from 'expo-file-system'

export const SHARE_APP_GROUP = 'group.com.kulesza.platekeeper'
export const PENDING_SHARE_FILENAME = 'shared_payload.json'

export type PendingShare =
  | { type: 'image' | 'url' | 'text'; value: string }
  | { type: 'job'; job_id: string; job_kind: string; job_input: Record<string, string> }

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

  let manifest: Record<string, unknown> | null = null
  try {
    manifest = await manifestFile.json() as Record<string, unknown>
  } catch {
    manifest = null
  }
  try {
    manifestFile.delete()
  } catch {
    // best-effort cleanup
  }

  if (!manifest?.type) return null

  if (manifest.type === 'job') {
    const job_id = manifest.job_id as string | undefined
    const job_kind = manifest.job_kind as string | undefined
    const job_input = manifest.job_input as Record<string, string> | undefined
    if (!job_id || !job_kind || !job_input) return null
    return { type: 'job', job_id, job_kind, job_input }
  }

  if (!manifest.value) return null
  const value = manifest.value as string

  if (manifest.type === 'image') {
    const imageFile = new File(container, value)
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

  return { type: manifest.type as 'url' | 'text', value }
}
