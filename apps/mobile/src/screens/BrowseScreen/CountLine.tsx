import { memo } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { AppText } from '../../components/ui'
import { screenGutter, space, useMotion } from '../../theme'
import { COUNT_LINE_HEIGHT } from './helpers'

interface CountLineProps {
  count: number
  sortLabel: string
}

const CountLine = ({ count, sortLabel }: CountLineProps) => {
  const { t } = useTranslation()
  const motion = useMotion()

  return (
    <View style={styles.container}>
      <Animated.View key={count} entering={motion.fade}>
        <AppText variant="meta" tone="textSecondary" tabular>
          {t('browse.recipeCount', { count })}
        </AppText>
      </Animated.View>
      <AppText variant="meta" tone="textSecondary" numberOfLines={1}>
        {sortLabel}
      </AppText>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    height: COUNT_LINE_HEIGHT,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: screenGutter,
    paddingBottom: space.xs,
  },
})

export default memo(CountLine)
