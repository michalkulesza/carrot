import { memo, useCallback, useMemo, type ReactNode } from 'react'
import { AccessibilityActionEvent, AccessibilityActionInfo, AccessibilityRole, ActivityIndicator, Pressable, StyleProp, StyleSheet, Switch, View, ViewStyle } from 'react-native'
import Animated from 'react-native-reanimated'
import { SymbolView, type SFSymbol } from 'expo-symbols'
import AppText from './AppText'
import { lightHaptic, selectionHaptic } from './haptics'
import { palette, space, usePressScale } from '../../theme'

export type SettingsRowTone = 'default' | 'destructive'
export type SettingsRowAccessory = 'chevron' | 'switch' | 'none' | ReactNode

interface SettingsRowProps {
  title: string
  subtitle?: string
  icon?: SFSymbol
  leading?: ReactNode
  value?: string
  accessory?: SettingsRowAccessory
  switchValue?: boolean
  onSwitchChange?: (value: boolean) => void
  tone?: SettingsRowTone
  loading?: boolean
  disabled?: boolean
  selected?: boolean
  onPress?: () => void
  accessibilityLabel?: string
  accessibilityRole?: AccessibilityRole
  accessibilityHint?: string
  accessibilityActions?: AccessibilityActionInfo[]
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void
  stacked?: boolean
}

const MIN_HEIGHT = 52
const ICON_COLUMN = 28
const ICON_SIZE = 20
const CHEVRON_SIZE = 13
const ROW_PRESS_SCALE = 0.98

const SettingsRow = ({
  title,
  subtitle,
  icon,
  leading,
  value,
  accessory = 'none',
  switchValue,
  onSwitchChange,
  tone = 'default',
  loading,
  disabled,
  selected,
  onPress,
  accessibilityLabel,
  accessibilityRole = 'button',
  accessibilityHint,
  accessibilityActions,
  onAccessibilityAction,
  stacked,
}: SettingsRowProps) => {
  const label = accessibilityLabel ?? title
  const hint = accessibilityHint ?? subtitle
  const rowStyle = stacked ? stackedRowStyle : styles.row
  const isSwitch = accessory === 'switch'
  const groupsText = typeof accessory === 'string'
  const accessibilityValue = useMemo(() => (value ? { text: value } : undefined), [value])

  const handleSwitchChange = useCallback(
    (next: boolean) => {
      selectionHaptic()
      onSwitchChange?.(next)
    },
    [onSwitchChange],
  )

  const handleAccessibilityTap = useCallback(
    () => handleSwitchChange(!switchValue),
    [handleSwitchChange, switchValue],
  )

  const switchTrackColor = useMemo(() => ({ true: palette.action }), [])
  const switchAccessibilityState = useMemo(
    () => ({ checked: Boolean(switchValue), disabled: Boolean(disabled) }),
    [switchValue, disabled],
  )
  const groupAccessibilityState = useMemo(() => ({ busy: Boolean(loading) }), [loading])

  const content = (
    <RowContent
      title={title}
      subtitle={subtitle}
      icon={icon}
      leading={leading}
      value={value}
      accessory={accessory}
      switchValue={switchValue}
      switchTrackColor={switchTrackColor}
      switchDisabled={disabled}
      onSwitchChange={handleSwitchChange}
      tone={tone}
      loading={loading}
      stacked={stacked}
    />
  )

  if (onPress) {
    return (
      <PressableRow
        rowStyle={rowStyle}
        onPress={onPress}
        disabled={disabled}
        loading={loading}
        selected={selected}
        label={label}
        hint={hint}
        role={accessibilityRole}
        accessibilityActions={accessibilityActions}
        onAccessibilityAction={onAccessibilityAction}
        accessibilityValue={accessibilityValue}
      >
        {content}
      </PressableRow>
    )
  }

  if (isSwitch) {
    return (
      <View
        style={rowStyle}
        accessible
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityHint={hint}
        accessibilityActions={accessibilityActions}
        onAccessibilityAction={onAccessibilityAction}
        accessibilityState={switchAccessibilityState}
        onAccessibilityTap={handleAccessibilityTap}
      >
        {content}
      </View>
    )
  }

  return (
    <View
      style={rowStyle}
      accessible={groupsText}
      accessibilityLabel={groupsText ? label : undefined}
      accessibilityHint={groupsText ? hint : undefined}
      accessibilityActions={groupsText ? accessibilityActions : undefined}
      onAccessibilityAction={groupsText ? onAccessibilityAction : undefined}
      accessibilityValue={groupsText ? accessibilityValue : undefined}
      accessibilityState={groupsText ? groupAccessibilityState : undefined}
    >
      {content}
    </View>
  )
}

interface PressableRowProps {
  rowStyle: StyleProp<ViewStyle>
  children: ReactNode
  onPress: () => void
  disabled?: boolean
  loading?: boolean
  selected?: boolean
  label: string
  hint?: string
  role: AccessibilityRole
  accessibilityValue?: { text: string }
  accessibilityActions?: AccessibilityActionInfo[]
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void
}

const PressableRow = ({
  children,
  rowStyle: baseStyle,
  onPress,
  disabled,
  loading,
  selected,
  label,
  hint,
  role,
  accessibilityValue,
  accessibilityActions,
  onAccessibilityAction,
}: PressableRowProps) => {
  const { animatedStyle, onPressIn, onPressOut } = usePressScale(ROW_PRESS_SCALE)
  const rowStyle = useMemo(() => [baseStyle, animatedStyle], [baseStyle, animatedStyle])
  const inactive = Boolean(disabled || loading)
  const accessibilityState = useMemo(
    () => ({ disabled: inactive, busy: Boolean(loading), selected }),
    [inactive, loading, selected],
  )

  const handlePress = useCallback(() => {
    lightHaptic()
    onPress()
  }, [onPress])

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={inactive}
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityValue={accessibilityValue}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      accessibilityState={accessibilityState}
    >
      <Animated.View style={rowStyle}>{children}</Animated.View>
    </Pressable>
  )
}

interface RowContentProps {
  title: string
  subtitle?: string
  icon?: SFSymbol
  leading?: ReactNode
  value?: string
  accessory: SettingsRowAccessory
  switchValue?: boolean
  switchTrackColor: { true: string }
  switchDisabled?: boolean
  onSwitchChange: (value: boolean) => void
  tone: SettingsRowTone
  loading?: boolean
  stacked?: boolean
}

const RowContent = ({
  title,
  subtitle,
  icon,
  leading,
  value,
  accessory,
  switchValue,
  switchTrackColor,
  switchDisabled,
  onSwitchChange,
  tone,
  loading,
  stacked,
}: RowContentProps) => {
  const destructive = tone === 'destructive'
  const titleTone = destructive ? 'error' : 'ink'
  const iconColor = destructive ? palette.error : palette.textSecondary

  return (
    <>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      {!leading && icon ? (
        <View style={styles.iconColumn}>
          <SymbolView name={icon} size={ICON_SIZE} weight="regular" tintColor={iconColor} />
        </View>
      ) : null}
      <View style={styles.text}>
        <AppText variant="controlLabel" tone={titleTone} numberOfLines={subtitle ? 1 : 2}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="tileMeta" tone="textSecondary" numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {value ? (
        <AppText variant="body" tone="textSecondary" numberOfLines={1} style={styles.value}>
          {value}
        </AppText>
      ) : null}
      {loading ? <ActivityIndicator /> : null}
      {loading ? null : (
        <Accessory
          accessory={accessory}
          switchValue={switchValue}
          switchTrackColor={switchTrackColor}
          switchDisabled={switchDisabled}
          onSwitchChange={onSwitchChange}
          stacked={stacked}
        />
      )}
    </>
  )
}

interface AccessoryProps {
  accessory: SettingsRowAccessory
  switchValue?: boolean
  switchTrackColor: { true: string }
  switchDisabled?: boolean
  onSwitchChange: (value: boolean) => void
  stacked?: boolean
}

const Accessory = ({ accessory, switchValue, switchTrackColor, switchDisabled, onSwitchChange, stacked }: AccessoryProps) => {
  if (accessory === 'none') return null

  if (accessory === 'chevron') {
    return <SymbolView name="chevron.right" size={CHEVRON_SIZE} weight="semibold" tintColor={palette.placeholder} />
  }

  if (accessory === 'switch') {
    return (
      <Switch
        value={Boolean(switchValue)}
        onValueChange={onSwitchChange}
        trackColor={switchTrackColor}
        disabled={switchDisabled}
      />
    )
  }

  return <View style={stacked ? styles.customStacked : styles.custom}>{accessory}</View>
}

const styles = StyleSheet.create({
  row: {
    minHeight: MIN_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
  },
  rowStacked: { flexWrap: 'wrap' },
  iconColumn: { width: ICON_COLUMN, alignItems: 'center', justifyContent: 'center' },
  leading: { alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0, gap: 1 },
  value: { flexShrink: 0 },
  custom: { flexShrink: 1 },
  customStacked: { width: '100%' },
})

const stackedRowStyle = [styles.row, styles.rowStacked]

export default memo(SettingsRow)
