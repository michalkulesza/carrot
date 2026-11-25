import { memo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { styles } from './styles'

export interface DrawerAction {
  label: string
  onPress: () => void
  disabled?: boolean
}

interface HeaderProps {
  title: string
  subtitle?: string
  countLabel: string
  action?: DrawerAction
}

const Header = ({ title, subtitle, countLabel, action }: HeaderProps) => {
  const actionLabelStyle = action?.disabled ? styles.actionLabelDisabled : styles.actionLabel

  return (
    <View style={styles.header}>
      <View style={styles.headerSide}>
        <Text style={styles.headerCount}>{countLabel}</Text>
      </View>
      <View style={styles.headerCenter}>
        <Text style={styles.headerTitle} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.headerSideEnd}>
        {action ? (
          <Pressable
            style={styles.actionButton}
            onPress={action.onPress}
            disabled={action.disabled}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            accessibilityState={{ disabled: !!action.disabled }}
          >
            <Text style={actionLabelStyle}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

export default memo(Header)
