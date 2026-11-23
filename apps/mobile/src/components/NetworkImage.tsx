import { useCallback, useState } from 'react'
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import { Image, ImageContentFit, ImageProps } from 'expo-image'
import ImageShimmer from './ImageShimmer'
import { PLACEHOLDER_URL } from '../api/thumbnailUrl'

type ImageState = { uri: string; loaded: boolean; usingPlaceholder: boolean }

const NetworkImage = ({
  uri,
  style,
  contentFit = 'cover',
  cachePolicy = 'memory-disk',
  recyclingKey,
  accessibilityLabel,
  fallbackToPlaceholder = true,
  onError,
}: {
  uri: string
  style: StyleProp<ViewStyle>
  contentFit?: ImageContentFit
  cachePolicy?: ImageProps['cachePolicy']
  recyclingKey?: string | null
  accessibilityLabel?: string
  fallbackToPlaceholder?: boolean
  onError?: () => void
}) => {
  const [state, setState] = useState<ImageState>({ uri, loaded: false, usingPlaceholder: false })
  const current = state.uri === uri ? state : { uri, loaded: false, usingPlaceholder: false }
  const displayUri = current.usingPlaceholder && PLACEHOLDER_URL ? PLACEHOLDER_URL : uri

  const handleLoad = useCallback(() => setState((prev) => ({ uri, loaded: true, usingPlaceholder: prev.uri === uri && prev.usingPlaceholder })), [uri])

  const handleError = useCallback(() => {
    const canFallBack = fallbackToPlaceholder && !current.usingPlaceholder && PLACEHOLDER_URL && uri !== PLACEHOLDER_URL
    setState({ uri, loaded: !canFallBack, usingPlaceholder: Boolean(canFallBack) })
    onError?.()
  }, [current.usingPlaceholder, fallbackToPlaceholder, onError, uri])

  return (
    <View style={[style, styles.wrapper]}>
      {!current.loaded && <ImageShimmer />}
      <Image
        source={{ uri: displayUri }}
        style={StyleSheet.absoluteFill}
        contentFit={contentFit}
        cachePolicy={cachePolicy}
        recyclingKey={recyclingKey}
        accessibilityLabel={accessibilityLabel}
        transition={220}
        onLoad={handleLoad}
        onError={handleError}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: { overflow: 'hidden' },
})

export default NetworkImage
