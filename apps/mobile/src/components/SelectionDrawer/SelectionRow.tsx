import { memo, useCallback, type ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { CheckboxCircle, Thumbnail } from '../ui'
import { lightHaptic } from '../ui/haptics'
import { SELECTION_THUMB_SIZE, styles } from './styles'

interface SelectionRowProps {
  id: string
  title: string
  meta?: string
  thumbnailUrl?: string | null
  leading?: ReactNode
  selected: boolean
  disabled?: boolean
  onToggle: (id: string) => void
}

const SelectionRow = ({ id, title, meta, thumbnailUrl, leading, selected, disabled, onToggle }: SelectionRowProps) => {
  const handlePress = useCallback(() => {
    lightHaptic()
    onToggle(id)
  }, [onToggle, id])

  const hasThumb = leading != null || thumbnailUrl !== undefined
  const rowStyle = [styles.row, styles.rowDivider, hasThumb ? styles.rowWithThumb : styles.rowPlain]
  const titleStyle = [hasThumb ? styles.titleThumb : styles.titlePlain, selected && styles.titleSelected]
  const accessibilityState = { checked: selected, disabled: !!disabled }

  return (
    <Pressable
      style={rowStyle}
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityLabel={title}
      accessibilityState={accessibilityState}
    >
      {leading ?? (thumbnailUrl !== undefined ? <Thumbnail url={thumbnailUrl} size={SELECTION_THUMB_SIZE} radiusKey="thumb" /> : null)}
      <View style={styles.rowText}>
        <Text style={titleStyle} numberOfLines={1}>
          {title}
        </Text>
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      </View>
      <CheckboxCircle checked={selected} />
    </Pressable>
  )
}

export default memo(SelectionRow)
