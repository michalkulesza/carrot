import { memo, useCallback, useMemo, useRef } from 'react'
import { Pressable, View } from 'react-native'
import Animated, { useReducedMotion } from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { SymbolView } from 'expo-symbols'
import { Swipeable } from 'react-native-gesture-handler'
import { DraxHandle } from 'react-native-drax'
import { AppText, Checkbox } from '../../components/ui'
import { palette } from '../../theme'
import { displayItemText, isMovePhase, type RowPhase } from './helpers'
import ItemTextEditor from './ItemTextEditor'
import { freshEntering } from './motion'
import StrikeLines from './StrikeLines'
import { checkboxHitSlop, styles } from './styles'
import { useRowCollapse } from './useRowCollapse'
import { useStrike } from './useStrike'

interface ShoppingItemRowProps {
  id: string
  text: string
  completed: boolean
  phase: RowPhase
  fresh: boolean
  editing: boolean
  lockName?: string
  lockColor?: string
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onEditStart: (id: string) => void
  onEditEnd: (id: string, initialText: string, nextText: string) => void
}

const DeleteAction = memo(({ id, label, onDelete }: { id: string; label: string; onDelete: (id: string) => void }) => {
  const handlePress = useCallback(() => onDelete(id), [id, onDelete])

  return (
    <Pressable style={styles.deleteAction} onPress={handlePress} accessibilityRole="button" accessibilityLabel={label}>
      <SymbolView name="trash" size={18} weight="semibold" tintColor={palette.onImage} />
    </Pressable>
  )
})

const ShoppingItemRow = ({
  id,
  text,
  completed,
  phase,
  fresh,
  editing,
  lockName,
  lockColor,
  onToggle,
  onDelete,
  onEditStart,
  onEditEnd,
}: ShoppingItemRowProps) => {
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()
  const { handleLayout, wrapperStyle, contentStyle } = useRowCollapse({ phase, ticked: completed && !editing })
  const { layout: strikeLayout, progress: strikeProgress, handleTextLayout } = useStrike({ completed, phase })
  const swipeActiveRef = useRef(false)

  const displayText = useMemo(() => displayItemText(text, t), [text, t])
  const locked = lockName !== undefined && !editing
  const interactive = !locked
  const lockLabel = lockName === undefined ? undefined : t('shoppingList.presenceEditing', { name: lockName })
  const checkboxLabel = t('shoppingList.gotItLabel', { item: displayText })
  const textLabel = lockLabel ?? displayText
  const editHint = locked ? undefined : t('shoppingList.editItemHint')
  const entering = fresh && !reduceMotion ? freshEntering : undefined
  const accessibilityActions = useMemo(() => [{ name: 'delete', label: t('common.delete') }], [t])
  const rowPointerEvents = isMovePhase(phase) ? 'none' : 'auto'
  const clipStyle = useMemo(() => [styles.clip, wrapperStyle], [wrapperStyle])
  const itemRowStyle = useMemo(() => [styles.itemRow, contentStyle], [contentStyle])
  const lockDotStyle = useMemo(() => [styles.lockDot, { backgroundColor: lockColor }], [lockColor])

  const handleToggle = useCallback(() => onToggle(id), [id, onToggle])

  const handleTextPress = useCallback(() => {
    if (swipeActiveRef.current) return
    onEditStart(id)
  }, [id, onEditStart])

  const handleAccessibilityAction = useCallback(() => onDelete(id), [id, onDelete])
  const handleSwipeStart = useCallback(() => { swipeActiveRef.current = true }, [])
  const handleSwipeClose = useCallback(() => { swipeActiveRef.current = false }, [])

  const renderRightActions = useCallback(
    () => (locked ? null : <DeleteAction id={id} label={t('common.delete')} onDelete={onDelete} />),
    [locked, id, onDelete, t],
  )

  return (
    <Swipeable
      renderRightActions={renderRightActions}
      overshootRight={false}
      onSwipeableOpenStartDrag={handleSwipeStart}
      onSwipeableCloseStartDrag={handleSwipeStart}
      onSwipeableClose={handleSwipeClose}
    >
      <Animated.View style={clipStyle} pointerEvents={rowPointerEvents}>
        <Animated.View entering={entering}>
          <View style={styles.rowSurface} onLayout={handleLayout}>
            <Animated.View style={itemRowStyle}>
              <Checkbox
                checked={completed}
                onToggle={handleToggle}
                accessibilityLabel={checkboxLabel}
                celebrate
                haptic="none"
                hitSlop={checkboxHitSlop}
              />
              <DraxHandle style={styles.textArea}>
                {editing ? (
                  <ItemTextEditor
                    id={id}
                    initialText={text}
                    accessibilityLabel={t('shoppingList.itemField')}
                    onEnd={onEditEnd}
                  />
                ) : (
                  <Pressable
                    onPress={handleTextPress}
                    disabled={!interactive}
                    accessibilityRole="button"
                    accessibilityLabel={textLabel}
                    accessibilityHint={editHint}
                    accessibilityActions={accessibilityActions}
                    onAccessibilityAction={handleAccessibilityAction}
                  >
                    <AppText variant="bodyLarge" onTextLayout={handleTextLayout}>{displayText}</AppText>
                    {strikeLayout ? <StrikeLines layout={strikeLayout} progress={strikeProgress} /> : null}
                    {locked ? (
                      <View style={styles.lockBadge}>
                        <View style={lockDotStyle} />
                        <AppText variant="badge" tone="textSecondary">{lockLabel}</AppText>
                      </View>
                    ) : null}
                  </Pressable>
                )}
              </DraxHandle>
              {locked ? <SymbolView name="lock" size={14} tintColor={palette.textTertiary} /> : null}
            </Animated.View>
          </View>
        </Animated.View>
      </Animated.View>
    </Swipeable>
  )
}

export default memo(ShoppingItemRow)
