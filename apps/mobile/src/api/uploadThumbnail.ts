import { getToken } from './client'

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? ''

export interface PickedImageAsset {
  uri: string
  mimeType?: string | null
}

// A recipe doesn't have an id yet while it's being imported or built from
// scratch; the upload endpoint only uses recipe_id to namespace the S3 key,
// so a client-generated placeholder works until the recipe is actually saved.
export const makeTempRecipeId = (): string =>
  `temp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

export const uploadThumbnailImage = (
  recipeId: string,
  asset: PickedImageAsset,
  onProgress?: (fraction: number) => void,
): Promise<{ url: string }> => {
  const formData = new FormData()
  formData.append('file', {
    uri: asset.uri,
    type: asset.mimeType ?? 'image/jpeg',
    name: 'thumbnail.jpg',
  } as unknown as Blob)
  const token = getToken()
  const url = `${API_BASE}/api/images/thumbnail?recipe_id=${encodeURIComponent(recipeId)}`
  // fetch + Hermes FormData rejects the {uri,type,name} blob shape;
  // XHR's native RCTNetworking layer handles it correctly.
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText) as { url: string })
      } else {
        reject(new Error('Upload failed'))
      }
    }
    xhr.onerror = () => reject(new Error('Upload failed'))
    xhr.send(formData)
  })
}
