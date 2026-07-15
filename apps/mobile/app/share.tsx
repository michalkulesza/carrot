import { useEffect, useRef, useState } from 'react'
import { File } from 'expo-file-system'
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router'
import { ActivityIndicator, PlatformColor, StyleSheet, View } from 'react-native'
import { clearSharedPayloads, getSharedPayloads } from 'expo-sharing'
import { useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '@carrot/shared/api/context'
import type { ImportJob } from '@carrot/shared/types'
import { createUuid } from '../src/utils/uuid'
import { setImportImagePreview } from '../src/utils/importImagePreviews'
import { resolveRecipePreview } from '../src/utils/recipePreview'

type ShareParams = { type?: string; value?: string; mimeType?: string }
type Destination = { pathname: '/import-recipe' }
type SharedImport = {
  kind: 'url' | 'text' | 'image'
  input: Record<string, string>
  previewImageUri?: string
}

const getSharedImport = async (params: ShareParams): Promise<SharedImport | null> => {
  if (params.type === 'url' && params.value) return { kind: 'url', input: { url: params.value } }
  if (params.type === 'text' && params.value) return { kind: 'text', input: { text: params.value } }
  if (params.type === 'image' && params.value) {
    const mimeType = params.mimeType ?? 'image/jpeg'
    return {
      kind: 'image',
      input: { image_base64: params.value, mime_type: mimeType },
      previewImageUri: `data:${mimeType};base64,${params.value}`,
    }
  }

  const payload = getSharedPayloads()[0]
  if (!payload) return null
  if (payload.shareType === 'url') return { kind: 'url', input: { url: payload.value } }
  if (payload.shareType === 'text') return { kind: 'text', input: { text: payload.value } }
  if (payload.shareType !== 'image') return null

  const imageBase64 = await new File(payload.value).base64()
  const mimeType = payload.mimeType ?? 'image/jpeg'
  return {
    kind: 'image',
    input: { image_base64: imageBase64, mime_type: mimeType },
    previewImageUri: `data:${mimeType};base64,${imageBase64}`,
  }
}

export default function ShareRedirect() {
  const params = useLocalSearchParams<ShareParams>()
  const api = useApiClient()
  const queryClient = useQueryClient()
  const router = useRouter()
  const [destination, setDestination] = useState<Destination | null>(null)
  const importingRef = useRef(false)

  useEffect(() => {
    if (importingRef.current) return
    importingRef.current = true

    const enqueueSharedImport = async () => {
      try {
        const sharedImport = await getSharedImport(params)
        if (!sharedImport) {
          setDestination({ pathname: '/import-recipe' })
          return
        }

        const job = await api.enqueueImportJob({
          kind: sharedImport.kind,
          input: sharedImport.input,
          idempotency_key: createUuid(),
        })
        if (sharedImport.previewImageUri) setImportImagePreview(job.id, sharedImport.previewImageUri)
        queryClient.setQueryData<ImportJob[]>(['importJobs'], (jobs = []) => [
          ...jobs.filter((item) => item.id !== job.id),
          job,
        ])
        if (sharedImport.kind === 'url') {
          void resolveRecipePreview(sharedImport.input.url).then((previewUrl) => {
            if (!previewUrl) return
            setImportImagePreview(job.id, previewUrl)
            queryClient.setQueryData<ImportJob[]>(['importJobs'], (jobs = []) => [...jobs])
          })
        }
        router.replace('/(tabs)/recipes')
      } catch {
        setDestination({ pathname: '/import-recipe' })
      } finally {
        clearSharedPayloads()
      }
    }

    void enqueueSharedImport()
  }, [api, params, queryClient, router])

  if (!destination) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
      </View>
    )
  }

  return <Redirect href={destination} />
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    backgroundColor: PlatformColor('systemBackground'),
    flex: 1,
    justifyContent: 'center',
  },
})
