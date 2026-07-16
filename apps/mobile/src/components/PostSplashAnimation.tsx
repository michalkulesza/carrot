import { useCallback, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import LottieView from 'lottie-react-native'

type PostSplashAnimationProps = {
  onReady: () => void
  onFinish: () => void
}

const PostSplashAnimation = ({ onReady, onFinish }: PostSplashAnimationProps) => {
  const hasLaidOut = useRef(false)

  const handleLayout = useCallback(() => {
    if (hasLaidOut.current) return

    hasLaidOut.current = true
    onReady()
  }, [onReady])

  return (
    <View style={styles.container} onLayout={handleLayout}>
      <LottieView
        autoPlay
        loop={false}
        resizeMode="cover"
        source={require('../../assets/postSplashAnim.json')}
        style={styles.animation}
        onAnimationFinish={onFinish}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
  },
  animation: {
    flex: 1,
  },
})

export default PostSplashAnimation
