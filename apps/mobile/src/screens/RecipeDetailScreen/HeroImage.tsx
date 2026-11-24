import { memo, useCallback } from 'react'
import { View } from 'react-native'
import { Link } from 'expo-router'
import NetworkImage from '../../components/NetworkImage'
import { proxyThumbnailUrl, PLACEHOLDER_URL } from '../../api/thumbnailUrl'
import { styles } from './styles'

interface HeroImageProps {
  title: string
  thumbnailUrl: string | null
  topInset: number
  errored: boolean
  onError: (errored: boolean) => void
}

const HEADER_CLEARANCE = 56

const HeroImage = ({ title, thumbnailUrl, topInset, errored, onError }: HeroImageProps) => {
  const heroUrl = proxyThumbnailUrl(thumbnailUrl)

  const handleError = useCallback(() => onError(true), [onError])

  if (!heroUrl) return <View style={{ height: topInset + HEADER_CLEARANCE }} />

  if (errored) {
    if (!PLACEHOLDER_URL) return <View style={{ height: topInset + HEADER_CLEARANCE }} />

    return <NetworkImage uri={PLACEHOLDER_URL} style={styles.readHero} accessibilityLabel={title} />
  }

  return (
    <Link.AppleZoomTarget>
      <NetworkImage
        uri={heroUrl}
        style={styles.readHero}
        accessibilityLabel={title}
        recyclingKey={heroUrl}
        onError={handleError}
      />
    </Link.AppleZoomTarget>
  )
}

export default memo(HeroImage)
