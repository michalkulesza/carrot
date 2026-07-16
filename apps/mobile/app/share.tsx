import { useEffect, useRef, useState } from 'react'
import { File } from 'expo-file-system'
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router'
import { ActivityIndicator, PlatformColor, StyleSheet, View } from 'react-native'
import { clearSharedPayloads, getSharedPayloads } from 'expo-sharing'
import { useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '@carrot/shared/api/context'
import { enqueueImport } from '../src/utils/enqueueImport'

type ShareParams = { type?: string; value?: string; mimeType?: string }
type Destination = { pathname: '/(tabs)/recipes'; params: { openAddRecipe: '1' } }
type SharedImport = {
  kind: 'url' | 'text' | 'image'
  input: Record<string, string>
}

const getSharedImport = async (params: ShareParams): Promise<SharedImport | null> => {
  if (params.type === 'url' && params.value) return { kind: 'url', input: { url: params.value } }
  if (params.type === 'text' && params.value) return { kind: 'text', input: { text: params.value } }
  if (params.type === 'image' && params.value) {
    return { kind: 'image', input: { image_base64: params.value, mime_type: params.mimeType ?? 'image/jpeg' } }
  }

  const payload = getSharedPayloads()[0]
  if (!payload) return null
  if (payload.shareType === 'url') return { kind: 'url', input: { url: payload.value } }
  if (payload.shareType === 'text') return { kind: 'text', input: { text: payload.value } }
  if (payload.shareType !== 'image') return null

  const imageBase64 = await new File(payload.value).base64()
  return { kind: 'image', input: { image_base64: imageBase64, mime_type: payload.mimeType ?? 'image/jpeg' } }
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
          setDestination({ pathname: '/(tabs)/recipes', params: { openAddRecipe: '1' } })
          return
        }

        await enqueueImport(api, queryClient, sharedImport.kind, sharedImport.input)
        router.replace('/(tabs)/recipes')
      } catch {
        setDestination({ pathname: '/(tabs)/recipes', params: { openAddRecipe: '1' } })
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
