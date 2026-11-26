import { requireOptionalNativeModule } from 'expo'

interface ScreenCornersNativeModule {
  getScreenCornerRadius(): Promise<number | null>
}

const nativeModule = requireOptionalNativeModule<ScreenCornersNativeModule>('ScreenCorners')

export const getScreenCornerRadius = async (): Promise<number | null> => {
  if (!nativeModule) return null

  try {
    return await nativeModule.getScreenCornerRadius()
  } catch {
    return null
  }
}
