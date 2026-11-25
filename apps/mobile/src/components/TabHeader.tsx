import { memo, type ReactNode } from 'react'
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import GlassViewSafe, { glassAvailable } from './GlassViewSafe'
import { palette, typography } from '../theme'

interface TabHeaderProps {
  title: string
  titleContent?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  onLayout: (e: LayoutChangeEvent) => void
}

const TabHeader = ({ title, titleContent, actions, children, onLayout }: TabHeaderProps) => {
  const { top } = useSafeAreaInsets()

  return (
    <View style={[styles.header, { paddingTop: top + 4 }]} onLayout={onLayout}>
      {glassAvailable ? <GlassViewSafe style={StyleSheet.absoluteFill} /> : <View style={styles.fallback} />}
      <View style={styles.titleRow}>
        <View style={styles.title}>
          {titleContent ?? (
            <Text style={styles.titleText} numberOfLines={1} accessibilityRole="header">
              {title}
            </Text>
          )}
        </View>
        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </View>
      {children}
    </View>
  )
}

export default memo(TabHeader)

const styles = StyleSheet.create({
  header: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1, paddingBottom: 8, gap: 8 },
  fallback: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: palette.background },
  titleRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20 },
  title: { flex: 1, minWidth: 0 },
  titleText: { ...typography.screenTitle, color: palette.ink },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
})
