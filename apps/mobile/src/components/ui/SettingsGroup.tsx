import { Children, isValidElement, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import Card from './Card'
import { palette, screenGutter, space, useMotion } from '../../theme'

interface SettingsGroupProps {
  children: ReactNode
  footer?: ReactNode
  animated?: boolean
}

const SettingsGroup = ({ children, footer, animated }: SettingsGroupProps) => {
  const { rowEntering, rowExiting, rowLayout } = useMotion()
  const rows = Children.toArray(children).filter(isValidElement)

  return (
    <Card style={styles.group}>
      {rows.map((child, index) => {
        const divider = index > 0 ? <View style={styles.divider} /> : null

        if (!animated) {
          return (
            <View key={child.key}>
              {divider}
              {child}
            </View>
          )
        }

        return (
          <Animated.View key={child.key} entering={rowEntering} exiting={rowExiting} layout={rowLayout}>
            {divider}
            {child}
          </Animated.View>
        )
      })}
      {footer ? (
        <>
          {rows.length > 0 ? <View style={styles.divider} /> : null}
          <View style={styles.footer}>{footer}</View>
        </>
      ) : null}
    </Card>
  )
}

const styles = StyleSheet.create({
  group: { marginHorizontal: screenGutter, paddingVertical: 0 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.dividerCard },
  footer: { paddingVertical: space.md },
})

export default SettingsGroup
