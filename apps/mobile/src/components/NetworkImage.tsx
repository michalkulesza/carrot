import { useCallback, useEffect, useState } from 'react'
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import { Image, ImageContentFit, ImageProps } from 'expo-image'
import ImageShimmer from './ImageShimmer'
import { PLACEHOLDER_URL } from '../api/thumbnailUrl'

const NetworkImage = ({
  uri,
  style,
  contentFit = 'cover',
  cachePolicy = 'memory-disk',
  recyclingKey,
  accessibilityLabel,
  onError,
}: {
  uri: string
  style: StyleProp<ViewStyle>
  contentFit?: ImageContentFit
  cachePolicy?: ImageProps['cachePolicy']
  recyclingKey?: string | null
  accessibilityLabel?: string
  onError?: () => void
}) => {
  const [loaded, setLoaded] = useState(false)
  const [displayUri, setDisplayUri] = useState(uri)
  const [usingPlaceholder, setUsingPlaceholder] = useState(false)

  useEffect(() => {
    setLoaded(false)
    setDisplayUri(uri)
    setUsingPlaceholder(false)
  }, [uri])

  const handleLoad = useCallback(() => setLoaded(true), [])

  const handleError = useCallback(() => {
    if (!usingPlaceholder && PLACEHOLDER_URL && displayUri !== PLACEHOLDER_URL) {
      setLoaded(false)
      setDisplayUri(PLACEHOLDER_URL)
      setUsingPlaceholder(true)
      onError?.()
      return
    }
    setLoaded(true)
    onError?.()
  }, [displayUri, onError, usingPlaceholder])

  return (
    <View style={[style, styles.wrapper]}>
      {!loaded && <ImageShimmer />}
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
