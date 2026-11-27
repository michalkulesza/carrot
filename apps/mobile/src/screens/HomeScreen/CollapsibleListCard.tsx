import { memo, useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { View } from 'react-native'
import Animated from 'react-native-reanimated'
import { Card, CardRowList, Expandable } from '../../components/ui'
import { useMotion } from '../../theme'
import { styles } from './styles'

interface CollapsibleListCardProps<T> {
  header: ReactNode
  items: T[]
  keyExtractor: (item: T, index: number) => string
  renderItem: (item: T, index: number) => ReactElement
  accessibilityLabel: string
  expandWhenIncreases?: number
}

const CollapsibleListCard = <T,>({
  header,
  items,
  keyExtractor,
  renderItem,
  accessibilityLabel,
  expandWhenIncreases = 0,
}: CollapsibleListCardProps<T>) => {
  const { entering, rowExiting, rowLayout } = useMotion()
  const [expanded, setExpanded] = useState(false)
  const previousTrigger = useRef(0)

  useEffect(() => {
    if (expandWhenIncreases > previousTrigger.current) setExpanded(true)
    previousTrigger.current = expandWhenIncreases
  }, [expandWhenIncreases])

  const handleToggle = useCallback(() => setExpanded((value) => !value), [])

  return (
    <Animated.View entering={entering} exiting={rowExiting} layout={rowLayout} style={styles.listSection}>
      <Card style={styles.listCard}>
        <Expandable header={header} expanded={expanded} onToggle={handleToggle} accessibilityLabel={accessibilityLabel}>
          <View style={styles.listBody}>
            <CardRowList items={items} keyExtractor={keyExtractor} renderItem={renderItem} />
          </View>
        </Expandable>
      </Card>
    </Animated.View>
  )
}

export default memo(CollapsibleListCard) as typeof CollapsibleListCard
