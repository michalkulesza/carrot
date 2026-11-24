import { Fragment, ReactElement, useMemo } from 'react'
import { StyleSheet } from 'react-native'
import Animated from 'react-native-reanimated'
import { palette, useMotion } from '../../theme'

interface CardRowListProps<T> {
  items: T[]
  keyExtractor: (item: T, index: number) => string
  renderItem: (item: T, index: number) => ReactElement
}

const CardRowList = <T,>({ items, keyExtractor, renderItem }: CardRowListProps<T>) => {
  const { rowEntering, rowExiting, rowLayout } = useMotion()

  const rows = useMemo(
    () =>
      items.map((item, index) => (
        <Animated.View key={keyExtractor(item, index)} entering={rowEntering} exiting={rowExiting} layout={rowLayout}>
          {index > 0 ? <Animated.View style={styles.divider} /> : null}
          {renderItem(item, index)}
        </Animated.View>
      )),
    [items, keyExtractor, renderItem, rowEntering, rowExiting, rowLayout],
  )

  return <Fragment>{rows}</Fragment>
}

const styles = StyleSheet.create({
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.dividerCard },
})

export default CardRowList
