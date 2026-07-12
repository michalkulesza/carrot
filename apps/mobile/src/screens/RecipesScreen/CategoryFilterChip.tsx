import { useCallback, useRef, useState } from 'react'
import {
  Dimensions,
  Modal,
  PlatformColor,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type View as RNView,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import type { Tag, TagCategory } from '@carrot/shared/types'
import { tTag } from '@carrot/shared/utils/tagUtils'
import GlassViewSafe from '../../components/GlassViewSafe'
import { colors } from '../../theme/colors'

const POPOVER_WIDTH = 180
const POPOVER_MARGIN = 12

interface PopoverPosition {
  top: number
  left: number
}

const CategoryFilterChip = ({
  category,
  tags,
  selectedTagIds,
  onToggle,
}: {
  category: TagCategory
  tags: Tag[]
  selectedTagIds: Set<string>
  onToggle: (tagId: string) => void
}) => {
  const { t } = useTranslation()
  const anchorRef = useRef<RNView>(null)
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition | null>(null)

  const selectedTags = tags.filter((tag) => selectedTagIds.has(tag.id))
  const isActive = selectedTags.length > 0
  const label = isActive
    ? selectedTags.length > 1
      ? `${tTag(selectedTags[0].name, t)} +${selectedTags.length - 1}`
      : tTag(selectedTags[0].name, t)
    : t(`tags.category.${category}`)

  const handleOpen = useCallback(() => {
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      const screenWidth = Dimensions.get('window').width
      const left = Math.min(x, screenWidth - POPOVER_WIDTH - POPOVER_MARGIN)
      setPopoverPosition({ top: y + height + 4, left: Math.max(left, POPOVER_MARGIN) })
    })
  }, [])

  const handleClose = useCallback(() => setPopoverPosition(null), [])

  return (
    <>
      <Pressable
        ref={anchorRef}
        onPress={handleOpen}
        style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
        accessibilityLabel={t(`tags.category.${category}`)}
        accessibilityRole="button"
        accessibilityState={{ selected: isActive }}
      >
        <GlassViewSafe
          style={StyleSheet.absoluteFill}
          glassEffectStyle={isActive ? 'clear' : 'regular'}
          tintColor={isActive ? colors.blue : colors.gray5}
        />
        <Text style={[styles.chipText, isActive && styles.chipTextSelected]} numberOfLines={1}>
          {label} ▾
        </Text>
      </Pressable>
      <Modal visible={popoverPosition !== null} transparent animationType="fade" onRequestClose={handleClose}>
        <Pressable style={styles.overlay} onPress={handleClose} />
        {popoverPosition && (
          <View style={[styles.popover, { top: popoverPosition.top, left: popoverPosition.left }]}>
            <ScrollView bounces={false} style={styles.popoverScroll}>
              {tags.map((tag) => {
                const isSelected = selectedTagIds.has(tag.id)
                return (
                  <Pressable
                    key={tag.id}
                    style={styles.row}
                    onPress={() => onToggle(tag.id)}
                    accessibilityLabel={tag.name}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Text style={styles.rowText} numberOfLines={1}>
                      {tTag(tag.name, t)}
                    </Text>
                    {isSelected && <Text style={styles.rowCheck}>✓</Text>}
                  </Pressable>
                )
              })}
            </ScrollView>
          </View>
        )}
      </Modal>
    </>
  )
}

export default CategoryFilterChip

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    overflow: 'hidden',
    maxWidth: 140,
  },
  chipText: { fontSize: 13, color: colors.secondaryLabel },
  chipTextSelected: { color: '#ffffff', fontWeight: '600' },
  overlay: { flex: 1 },
  popover: {
    position: 'absolute',
    width: POPOVER_WIDTH,
    maxHeight: 260,
    backgroundColor: PlatformColor('systemBackground') as unknown as string,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  popoverScroll: { flexGrow: 0 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: PlatformColor('separator') as unknown as string,
  },
  rowText: { fontSize: 15, color: PlatformColor('label') as unknown as string, flexShrink: 1 },
  rowCheck: { fontSize: 15, color: colors.brand, marginLeft: 8 },
})
